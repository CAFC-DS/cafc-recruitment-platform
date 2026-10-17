"""Versioned five-pair correction with an atomic, same-schema release ledger.

Production mutations require explicit CLI acknowledgement and stopped writers.
No grants, application flags, deployments or compatibility rebuilds are performed.
"""
import argparse
import json
import re
from pathlib import Path
import sys
from connection import connect, isolated_schema
import reconcile_player_duplicates as correction
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import canonical_players

VERSION = 'player-duplicates-v1'
LEDGER = 'PLAYER_DUPLICATE_RELEASE_LEDGER'
EXPECTED_SOURCES = {1354027:{'106165','109214'},1282585:{'208906','209081'},
                    1365024:{'115086','234837'},1350827:{'106166','115335'},
                    1299064:{'222391','248285'}}


def target(name, production=False):
    if name == 'CORE' and production:
        return 'CAFC_DB.CORE'
    return isolated_schema(name)


def prepare(connection, name, production=False):
    schema = target(name, production)
    connection.cursor().execute(f'''CREATE TABLE IF NOT EXISTS {schema}.{LEDGER} (
        RELEASE_ID VARCHAR NOT NULL, VERSION VARCHAR NOT NULL, STATE VARCHAR NOT NULL,
        BASELINE VARIANT NOT NULL, APPLIED VARIANT NOT NULL,
        CREATED_BY VARCHAR, CREATED_AT TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(),
        RESTORED_AT TIMESTAMP_LTZ)''')


def entries(cursor, schema, release_id):
    return correction.rows(cursor, f'SELECT VERSION,STATE,BASELINE,APPLIED FROM {schema}.{LEDGER} WHERE RELEASE_ID=%s', (release_id,))


def decode(value):
    return json.loads(value) if isinstance(value, str) else value


def assert_baseline(baseline, schema):
    if baseline['schema'] != schema or tuple((p['duplicate'],p['survivor']) for p in baseline['pairs']) != correction.PAIRS:
        raise ValueError('Ledger target or pair set disagrees with reviewed release')
    correction.require_safe_plan(baseline)
    for pair in baseline['pairs']:
        if {(s['system'],str(s['source_id'])) for s in pair['sources']} != {
                ('IMPECT',sid) for sid in EXPECTED_SOURCES[pair['duplicate']]}:
            raise ValueError('Provider source set changed since review')


def run(connection, name, release_id, *, production=False, restore=False):
    schema = target(name, production)
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', release_id):
        raise ValueError('Unsafe release identifier')
    connection.autocommit(False)
    try:
        cursor = connection.cursor();cursor.execute('BEGIN')
        saved = entries(cursor, schema, release_id)
        if len(saved) > 1:
            raise ValueError('Duplicate ledger entries; concurrent execution refused')
        current = correction.audit(connection, name, include_legacy=production)
        assert_baseline(current, schema)
        if saved:
            entry = saved[0]
            if entry['STATE'] not in {'APPLIED','RESTORED'}:
                raise ValueError('Unknown release ledger state')
            if entry['VERSION'] != VERSION:
                raise ValueError('Unknown release ledger version')
            baseline = decode(entry['BASELINE']);assert_baseline(baseline, schema)
            applied = decode(entry['APPLIED']);assert_baseline(applied, schema)
            # Full audit equality detects changes to states, timestamps, overrides
            # and references before idempotent return or restoration.
            expected = baseline if entry['STATE'] == 'RESTORED' else applied
            if correction.fingerprint(current, set()) != correction.fingerprint(expected, set()):
                raise ValueError('Release state drifted; review before replay/restoration')
            if restore and entry['STATE'] == 'RESTORED':
                connection.rollback();return current
            if not restore:
                if entry['STATE'] != 'APPLIED':
                    raise ValueError('Restored release ID cannot be reapplied; use a new reviewed ID')
                canonical_players.validate(cursor, schema)
                connection.rollback();return current
        elif restore:
            raise ValueError('No recorded release baseline')
        else:
            baseline = current
            if any(p['duplicate_active'] is not True for p in baseline['pairs']):
                raise ValueError('Fresh release requires all five duplicates active')
        if restore:
            for pair in baseline['pairs']:
                for link in pair['sources']:
                    if link['override_ids']:
                        continue
                    reason = f"Migration duplicate {pair['duplicate']} retired; preserve existing resolver {pair['survivor']}"
                    records = correction.rows(cursor, f'SELECT CAFC_PLAYER_ID,REASON FROM {schema}.PLAYER_IDENTITY_OVERRIDES WHERE SOURCE_SYSTEM=%s AND SOURCE_PLAYER_ID=%s', (link['system'],link['source_id']))
                    if records != [{'CAFC_PLAYER_ID':pair['survivor'],'REASON':reason}]:
                        raise ValueError('Override ownership changed')
                    cursor.execute(f'DELETE FROM {schema}.PLAYER_IDENTITY_OVERRIDES WHERE SOURCE_SYSTEM=%s AND SOURCE_PLAYER_ID=%s AND CAFC_PLAYER_ID=%s AND REASON=%s', (link['system'],link['source_id'],pair['survivor'],reason))
                cursor.execute(f'UPDATE {schema}.PLAYERS SET IS_ACTIVE=%s,UPDATED_AT=%s WHERE CAFC_PLAYER_ID=%s', (pair['duplicate_active'],pair['duplicate_updated_at'],pair['duplicate']))
            after = correction.audit(connection, name, include_legacy=production)
            if correction.fingerprint(after, set()) != correction.fingerprint(baseline, set()):
                raise ValueError('Restoration does not match recorded baseline')
            cursor.execute(f"UPDATE {schema}.{LEDGER} SET STATE='RESTORED',RESTORED_AT=CURRENT_TIMESTAMP() WHERE RELEASE_ID=%s AND STATE='APPLIED'", (release_id,))
        else:
            # Multiple release IDs must not concurrently mutate the same pairs.
            # All writers and other installer invocations must be externally paused.
            for sql, params in correction.statements(baseline, schema):
                cursor.execute(sql, params)
            after = correction.audit(connection, name, include_legacy=production)
            correction.require_safe_plan(after)
            if any(p['duplicate_active'] is not False for p in after['pairs']):
                raise ValueError('Incomplete retirement')
            canonical_players.validate(cursor, schema)
            cursor.execute(f'''INSERT INTO {schema}.{LEDGER}
                (RELEASE_ID,VERSION,STATE,BASELINE,APPLIED,CREATED_BY)
                SELECT %s,%s,'APPLIED',PARSE_JSON(%s),PARSE_JSON(%s),CURRENT_USER()''',
                (release_id,VERSION,json.dumps(baseline,default=str),json.dumps(after,default=str)))
        connection.commit();return after
    except Exception:
        connection.rollback();raise
    finally:
        connection.autocommit(True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--env-file', required=True);p.add_argument('--schema', required=True)
    p.add_argument('--release-id', required=True);p.add_argument('--result', type=Path, required=True)
    p.add_argument('--prepare-ledger', action='store_true');p.add_argument('--restore', action='store_true')
    p.add_argument('--writers-stopped', action='store_true');p.add_argument('--execute-production', action='store_true')
    a = p.parse_args()
    if not a.writers_stopped:
        p.error('All writers and competing installer invocations must be stopped')
    target(a.schema,a.execute_production)
    if a.prepare_ledger and a.restore:
        p.error('Prepare ledger and restore are separate operations')
    c = connect(a.env_file)
    try:
        if a.prepare_ledger:
            prepare(c,a.schema,a.execute_production)
            result = {'schema':target(a.schema,a.execute_production),'ledger_prepared':True}
        else:
            result = run(c,a.schema,a.release_id,production=a.execute_production,restore=a.restore)
        a.result.write_text(json.dumps(result,indent=2,default=str)+'\n')
    finally:
        c.close()
