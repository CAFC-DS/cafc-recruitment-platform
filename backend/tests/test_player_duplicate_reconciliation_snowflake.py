"""Real transactional correction rehearsal on a fresh CORE clone; production is read only."""
import os
import sys
from pathlib import Path
from uuid import uuid4
import json
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/normalisation'))
import canonical_players
import reconcile_player_duplicates as correction
from connection import connect, isolated_schema

pytestmark=pytest.mark.skipif(not os.getenv('CAFC_PLAYER_TEST_ENV_FILE'),reason='Explicit isolated Snowflake connection required')


@pytest.fixture(scope='module')
def rehearsal():
    conn=connect(os.environ['CAFC_PLAYER_TEST_ENV_FILE'])
    name='CORE_DEV_CODEX_DUPLICATES_'+uuid4().hex[:12].upper()
    schema=isolated_schema(name);cursor=conn.cursor()
    cursor.execute(f'CREATE SCHEMA {schema} CLONE CAFC_DB.CORE')
    ddl=Path(correction.__file__).parent/'recovered/core_player_id_resolutions.sql'
    cursor.execute(ddl.read_text().replace('{{schema}}',schema).replace('CAFC_DB.CORE.',schema+'.'))
    cursor.execute(f'CREATE TABLE {schema}.PLAYER_READ_BEFORE_BACKUP AS SELECT * FROM {canonical_players.projection(schema)}')
    before_count=cursor.execute(f'SELECT COUNT(*) FROM {schema}.PLAYER_READ_BEFORE_BACKUP').fetchone()[0]
    identities=cursor.execute(f'SELECT COUNT(*) FROM {schema}.PLAYER_IDENTITIES').fetchone()[0]
    yield {'connection':conn,'name':name,'schema':schema,'identity_count':identities,'before_count':before_count}
    # Keep the corrected clone as release evidence; no flags or synthetic users are enabled.
    conn.close()


def test_failed_correction_rolls_back_retirement_and_overrides(rehearsal,monkeypatch):
    h=rehearsal;conn=h['connection'];schema=h['schema'];original=correction.statements
    def fail_after_first_pair(result,target):
        for index,item in enumerate(original(result,target)):
            if index==3:raise RuntimeError('Injected correction failure')
            yield item
    monkeypatch.setattr(correction,'statements',fail_after_first_pair)
    with pytest.raises(RuntimeError,match='Injected correction failure'):
        correction.apply(conn,h['name'])
    c=conn.cursor()
    retired=','.join(str(pair[0]) for pair in correction.PAIRS)
    c.execute(f'SELECT COUNT(*) FROM {schema}.PLAYERS WHERE CAFC_PLAYER_ID IN ({retired}) AND IS_ACTIVE=TRUE')
    assert c.fetchone()[0]==5
    c.execute(f"SELECT COUNT(*) FROM {schema}.PLAYER_IDENTITY_OVERRIDES WHERE REASON LIKE 'Migration duplicate % retired; preserve existing resolver %'")
    assert c.fetchone()[0]==0
    with pytest.raises(RuntimeError,match='identities disagree'):
        canonical_players.validate(c,schema)


def test_correction_unlocks_native_reads_and_retains_history(rehearsal):
    h=rehearsal;conn=h['connection'];schema=h['schema']
    h['baseline']=correction.audit(conn,h['name'])
    result=correction.apply(conn,h['name']);h['result']=result
    assert all(pair['duplicate_active'] is False and pair['identity_bags_equal'] for pair in result['pairs'])
    assert all(link['override_ids']==[pair['survivor']] for pair in result['pairs'] for link in pair['sources'])
    c=conn.cursor();canonical_players.validate(c,schema)
    c.execute(f'SELECT COUNT(*) FROM {schema}.PLAYER_IDENTITIES')
    assert c.fetchone()[0]==h['identity_count']
    c.execute(f'SELECT COUNT(*) FROM {schema}.PLAYERS WHERE CAFC_PLAYER_ID IN ({",".join(str(i) for pair in correction.PAIRS for i in pair)})')
    assert c.fetchone()[0]==10


def test_only_five_expected_rows_disappear_and_provider_mappings_are_stable(rehearsal):
    h=rehearsal;c=h['connection'].cursor();schema=h['schema']
    native=canonical_players.projection(schema)
    c.execute(f'SELECT CAFC_PLAYER_ID FROM (SELECT * FROM {schema}.PLAYER_READ_BEFORE_BACKUP MINUS SELECT * FROM {native})')
    assert {int(row[0]) for row in c.fetchall()}=={pair[0] for pair in correction.PAIRS}
    c.execute(f'SELECT COUNT(*) FROM (SELECT * FROM {native} MINUS SELECT * FROM {schema}.PLAYER_READ_BEFORE_BACKUP)')
    assert c.fetchone()[0]==0
    c.execute(f'SELECT COUNT(*) FROM {native}')
    assert c.fetchone()[0]==h['before_count']-5
    for pair in h['result']['pairs']:
        for link in pair['sources']:
            c.execute(f'SELECT CAFC_PLAYER_ID FROM {schema}.CORE_PLAYER_ID_RESOLUTIONS WHERE SOURCE_SYSTEM=%s AND SOURCE_PLAYER_ID=%s',(link['system'],link['source_id']))
            assert c.fetchall()==[(pair['survivor'],)]


def test_repeated_correction_is_idempotent(rehearsal):
    h=rehearsal
    result=correction.apply(h['connection'],h['name'])
    assert all(pair['duplicate_active'] is False for pair in result['pairs'])
    c=h['connection'].cursor()
    c.execute(f"SELECT COUNT(*) FROM {h['schema']}.PLAYER_IDENTITY_OVERRIDES WHERE REASON LIKE 'Migration duplicate % retired; preserve existing resolver %'")
    assert c.fetchone()[0]==10
    target=Path(os.getenv('CAFC_DUPLICATE_TEST_RESULT','/tmp/cafc-player-duplicate-rehearsal.json'))
    target.write_text(json.dumps(result,indent=2,default=str)+'\n')
    print('Corrected rehearsal schema:',h['schema'])


def test_recorded_rollback_restores_original_state_then_reapply_passes(rehearsal):
    h=rehearsal;conn=h['connection'];schema=h['schema']
    restored=correction.rollback(conn,h['name'],h['baseline'])
    assert all(pair['duplicate_active'] is True for pair in restored['pairs'])
    assert all(not link['override_ids'] for pair in restored['pairs'] for link in pair['sources'])
    c=conn.cursor()
    c.execute(f'SELECT COUNT(*) FROM (SELECT * FROM {schema}.PLAYER_READ_BEFORE_BACKUP MINUS SELECT * FROM {canonical_players.projection(schema)})')
    assert c.fetchone()[0]==0
    with pytest.raises(RuntimeError,match='identities disagree'):
        canonical_players.validate(c,schema)
    final=correction.apply(conn,h['name'])
    canonical_players.validate(c,schema)
    target=Path(os.getenv('CAFC_DUPLICATE_TEST_RESULT','/tmp/cafc-player-duplicate-rehearsal.json'))
    target.write_text(json.dumps(final,indent=2,default=str)+'\n')
