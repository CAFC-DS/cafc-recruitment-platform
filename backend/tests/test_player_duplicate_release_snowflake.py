"""Rehearse the production-capable installer only on a fresh isolated clone."""
import json
import os
from pathlib import Path
import sys
from uuid import uuid4
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/normalisation'))
import player_duplicate_release as release
from connection import connect

pytestmark=pytest.mark.skipif(not os.getenv('CAFC_PLAYER_TEST_ENV_FILE'),reason='Explicit clone connection required')


def test_atomic_ledger_apply_failure_idempotency_drift_and_restore(monkeypatch):
    conn=connect(os.environ['CAFC_PLAYER_TEST_ENV_FILE'])
    name='CORE_DEV_CODEX_RELEASE_'+uuid4().hex[:12].upper();schema=release.target(name)
    c=conn.cursor();c.execute(f'CREATE SCHEMA {schema} CLONE CAFC_DB.CORE')
    root=Path(release.__file__).parent
    c.execute((root/'recovered/core_player_id_resolutions.sql').read_text().replace('{{schema}}',schema).replace('CAFC_DB.CORE.',schema+'.'))
    c.execute(f'CREATE TABLE {schema}.PLAYER_READ_BEFORE_BACKUP AS SELECT * FROM {release.canonical_players.projection(schema)}')
    release.prepare(conn,name);baseline=release.correction.audit(conn,name)
    original=release.correction.statements
    def fail(result,target):
        for index,item in enumerate(original(result,target)):
            if index==3:raise RuntimeError('Injected release failure')
            yield item
    try:
        monkeypatch.setattr(release.correction,'statements',fail)
        with pytest.raises(RuntimeError,match='Injected'):
            release.run(conn,name,'failure')
        assert not release.entries(c,schema,'failure')
        assert release.correction.audit(conn,name)==baseline
        monkeypatch.setattr(release.correction,'statements',original)
        applied=release.run(conn,name,'release-1')
        assert all(p['duplicate_active'] is False for p in applied['pairs'])
        assert release.run(conn,name,'release-1')==applied
        c.execute(f'SELECT COUNT(*) FROM (SELECT * FROM {schema}.PLAYER_READ_BEFORE_BACKUP MINUS SELECT * FROM {release.canonical_players.projection(schema)})')
        assert c.fetchone()[0]==5
        c.execute(f'SELECT COUNT(*) FROM (SELECT * FROM {release.canonical_players.projection(schema)} MINUS SELECT * FROM {schema}.PLAYER_READ_BEFORE_BACKUP)')
        assert c.fetchone()[0]==0
        c.execute(f"UPDATE {schema}.PLAYER_IDENTITY_OVERRIDES SET REASON='Changed owner' WHERE SOURCE_PLAYER_ID='106165'")
        with pytest.raises(ValueError,match='ownership'):
            release.run(conn,name,'release-1',restore=True)
        c.execute(f"UPDATE {schema}.PLAYER_IDENTITY_OVERRIDES SET REASON=%s WHERE SOURCE_PLAYER_ID='106165'",('Migration duplicate 1354027 retired; preserve existing resolver 1329814',))
        restored=release.run(conn,name,'release-1',restore=True)
        assert release.correction.fingerprint(restored,set())==release.correction.fingerprint(baseline,set())
        assert release.correction.fingerprint(release.run(conn,name,'release-1',restore=True),set())==release.correction.fingerprint(baseline,set())
        with pytest.raises(ValueError,match='cannot be reapplied'):
            release.run(conn,name,'release-1')
        final=release.run(conn,name,'release-2')
        assert all(p['duplicate_active'] is False for p in final['pairs'])
        ledger=release.entries(c,schema,'release-2');assert len(ledger)==1 and ledger[0]['STATE']=='APPLIED'
        Path('/tmp/cafc-current-release-rehearsal.json').write_text(json.dumps({'schema':schema,'passed':True,'checks':['failure rollback with no ledger','exact five-row difference','idempotent apply','override ownership drift refused','recorded restore','idempotent restore','restored ID replay refused','new release reapplication'],'result':final},indent=2,default=str)+'\n')
    finally:
        conn.close()
