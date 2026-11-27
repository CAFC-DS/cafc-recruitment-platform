"""Add and backfill canonical player/fixture keys on scout reports and list items.

Modes (run in this order for a target):
  dry-run      read-only: counts of rows each key would resolve, stay unresolved
               or be ambiguous. Writes nothing.
  add-columns  ALTER TABLE ... ADD COLUMN IF NOT EXISTS for the CANONICAL_* columns.
               For CORE, refuses while APP_COMPAT.SCOUT_REPORTS/PLAYER_LIST_ITEMS are
               still select-* views (adding a column would break them).
  backfill     fills only rows whose canonical keys are still NULL, in one
               transaction. Safe with the app running: new saves set their own keys.
  verify       read-only: stored keys vs keys recomputed now; must be zero mismatches.

Keys follow the app's own read rules, so they are what the app already shows:
  player  external report/list row (PLAYER_ID set): the active player whose PLAYERID
          equals it in the native player projection; internal row: its CAFC_PLAYER_ID
          if that internal player exists. More than one candidate -> left NULL.
  fixture MATCH_ID equal to an external APP_COMPAT.MATCHES.ID first, else an internal
          CAFC_MATCH_ID (same order as find_match_by_any_id). Ambiguous -> NULL.

CORE requires --execute-production for add-columns/backfill; otherwise only isolated
CORE_DEV_CODEX_* schemas are accepted. Never deletes or rewrites other columns.
"""
import argparse
import json
import re
import sys
from pathlib import Path

from connection import connect, isolated_schema

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import canonical_players  # noqa: E402


def target_schema(name, production):
    if name.upper() == 'CORE':
        if not production:
            raise SystemExit('CORE needs --execute-production for writes')
        return 'CAFC_DB.CORE'
    return isolated_schema(name)


def player_keys(schema):
    players = canonical_players.projection(schema)
    return f"""
        ext AS (SELECT PLAYERID, MIN(CAFC_PLAYER_ID) AS CAFC_PLAYER_ID, COUNT(DISTINCT CAFC_PLAYER_ID) AS N
                FROM {players} WHERE DATA_SOURCE = 'external' AND PLAYERID IS NOT NULL GROUP BY PLAYERID),
        intp AS (SELECT DISTINCT CAFC_PLAYER_ID FROM {players} WHERE DATA_SOURCE = 'internal')"""


MATCHES = """
        mext AS (SELECT ID, MIN(CAFC_MATCH_ID) AS CAFC_MATCH_ID, COUNT(DISTINCT CAFC_MATCH_ID) AS N
                 FROM CAFC_DB.APP_COMPAT.MATCHES WHERE DATA_SOURCE = 'external' AND ID IS NOT NULL GROUP BY ID),
        mint AS (SELECT CAFC_MATCH_ID, COUNT(*) AS N
                 FROM CAFC_DB.APP_COMPAT.MATCHES WHERE DATA_SOURCE = 'internal' GROUP BY CAFC_MATCH_ID)"""


def report_keys_sql(schema):
    return f"""WITH {player_keys(schema)}, {MATCHES},
        k AS (
            SELECT sr.ID,
                CASE WHEN sr.PLAYER_ID IS NOT NULL THEN IFF(ext.N = 1, ext.CAFC_PLAYER_ID, NULL)
                     ELSE intp.CAFC_PLAYER_ID END AS PLAYER_KEY,
                CASE WHEN sr.PLAYER_ID IS NOT NULL AND ext.N > 1 THEN 'ambiguous'
                     WHEN sr.PLAYER_ID IS NULL AND sr.CAFC_PLAYER_ID IS NULL THEN 'none'
                     WHEN (sr.PLAYER_ID IS NOT NULL AND ext.N IS NULL) OR (sr.PLAYER_ID IS NULL AND intp.CAFC_PLAYER_ID IS NULL) THEN 'unresolved'
                     ELSE 'resolved' END AS PLAYER_STATUS,
                CASE WHEN mext.N = 1 THEN mext.CAFC_MATCH_ID
                     WHEN mext.N IS NULL AND mint.N = 1 THEN mint.CAFC_MATCH_ID END AS FIXTURE_KEY,
                CASE WHEN sr.MATCH_ID IS NULL THEN 'none'
                     WHEN mext.N > 1 OR (mext.N IS NULL AND mint.N > 1) THEN 'ambiguous'
                     WHEN mext.N IS NULL AND mint.N IS NULL THEN 'unresolved'
                     ELSE 'resolved' END AS FIXTURE_STATUS
            FROM {schema}.SCOUT_REPORTS sr
            LEFT JOIN ext ON ext.PLAYERID = sr.PLAYER_ID
            LEFT JOIN intp ON sr.PLAYER_ID IS NULL AND intp.CAFC_PLAYER_ID = sr.CAFC_PLAYER_ID
            LEFT JOIN mext ON mext.ID = sr.MATCH_ID
            LEFT JOIN mint ON mint.CAFC_MATCH_ID = sr.MATCH_ID)"""


def list_keys_sql(schema):
    return f"""WITH {player_keys(schema)},
        k AS (
            SELECT i.ID,
                CASE WHEN i.PLAYER_ID IS NOT NULL THEN IFF(ext.N = 1, ext.CAFC_PLAYER_ID, NULL)
                     ELSE intp.CAFC_PLAYER_ID END AS PLAYER_KEY,
                CASE WHEN i.PLAYER_ID IS NOT NULL AND ext.N > 1 THEN 'ambiguous'
                     WHEN i.PLAYER_ID IS NULL AND i.CAFC_PLAYER_ID IS NULL THEN 'none'
                     WHEN (i.PLAYER_ID IS NOT NULL AND ext.N IS NULL) OR (i.PLAYER_ID IS NULL AND intp.CAFC_PLAYER_ID IS NULL) THEN 'unresolved'
                     ELSE 'resolved' END AS PLAYER_STATUS
            FROM {schema}.PLAYER_LIST_ITEMS i
            LEFT JOIN ext ON ext.PLAYERID = i.PLAYER_ID
            LEFT JOIN intp ON i.PLAYER_ID IS NULL AND intp.CAFC_PLAYER_ID = i.CAFC_PLAYER_ID)"""


def counts(cur, sql, cols):
    out = {}
    for col in cols:
        cur.execute(f"{sql} SELECT {col}, COUNT(*) FROM k GROUP BY 1 ORDER BY 1")
        out[col] = {str(a): int(b) for a, b in cur.fetchall()}
    return out


def has_columns(cur, schema, table, columns):
    db, sch = schema.split('.')
    cur.execute(f"SELECT COLUMN_NAME FROM {db}.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s", (sch, table))
    present = {r[0] for r in cur.fetchall()}
    return set(columns) <= present


def select_star_compat_views(cur):
    bad = []
    for view in ('SCOUT_REPORTS', 'PLAYER_LIST_ITEMS'):
        cur.execute(f"SELECT GET_DDL('VIEW', 'CAFC_DB.APP_COMPAT.{view}')")
        if re.search(r'(?is)select\s+\*\s+from', cur.fetchone()[0]):
            bad.append(view)
    return bad


def run(args):
    production = args.execute_production
    schema = target_schema(args.schema, production) if args.mode in ('add-columns', 'backfill') else (
        'CAFC_DB.CORE' if args.schema.upper() == 'CORE' else isolated_schema(args.schema))
    conn = connect(args.env_file)
    cur = conn.cursor()
    result = {'schema': schema, 'mode': args.mode}
    reports, lists = report_keys_sql(schema), list_keys_sql(schema)
    try:
        if args.mode == 'dry-run':
            result['reports'] = counts(cur, reports, ['PLAYER_STATUS', 'FIXTURE_STATUS'])
            result['list_items'] = counts(cur, lists, ['PLAYER_STATUS'])
        elif args.mode == 'add-columns':
            if schema == 'CAFC_DB.CORE':
                bad = select_star_compat_views(cur)
                if bad:
                    raise SystemExit(f'Refusing: APP_COMPAT views still select-*: {bad}. Build data-platform PR #18 first.')
            cur.execute(f"ALTER TABLE {schema}.SCOUT_REPORTS ADD COLUMN IF NOT EXISTS CANONICAL_PLAYER_ID NUMBER(38,0)")
            cur.execute(f"ALTER TABLE {schema}.SCOUT_REPORTS ADD COLUMN IF NOT EXISTS CANONICAL_FIXTURE_ID NUMBER(38,0)")
            cur.execute(f"ALTER TABLE {schema}.PLAYER_LIST_ITEMS ADD COLUMN IF NOT EXISTS CANONICAL_PLAYER_ID NUMBER(38,0)")
            result['columns_present'] = (
                has_columns(cur, schema, 'SCOUT_REPORTS', ['CANONICAL_PLAYER_ID', 'CANONICAL_FIXTURE_ID'])
                and has_columns(cur, schema, 'PLAYER_LIST_ITEMS', ['CANONICAL_PLAYER_ID']))
            if schema == 'CAFC_DB.CORE':
                for view in ('SCOUT_REPORTS', 'PLAYER_LIST_ITEMS'):
                    cur.execute(f'SELECT COUNT(*) FROM CAFC_DB.APP_COMPAT.{view}')
                result['app_compat_views_still_readable'] = True
        elif args.mode == 'backfill':
            cur.execute('BEGIN')
            cur.execute(f"""UPDATE {schema}.SCOUT_REPORTS t SET CANONICAL_PLAYER_ID = k.PLAYER_KEY, CANONICAL_FIXTURE_ID = k.FIXTURE_KEY
                FROM ({reports} SELECT * FROM k) k
                WHERE t.ID = k.ID AND t.CANONICAL_PLAYER_ID IS NULL AND t.CANONICAL_FIXTURE_ID IS NULL
                  AND (k.PLAYER_KEY IS NOT NULL OR k.FIXTURE_KEY IS NOT NULL)""")
            result['reports_updated'] = cur.rowcount
            cur.execute(f"""UPDATE {schema}.PLAYER_LIST_ITEMS t SET CANONICAL_PLAYER_ID = k.PLAYER_KEY
                FROM ({lists} SELECT * FROM k) k
                WHERE t.ID = k.ID AND t.CANONICAL_PLAYER_ID IS NULL AND k.PLAYER_KEY IS NOT NULL""")
            result['list_items_updated'] = cur.rowcount
            cur.execute('COMMIT')
        elif args.mode == 'verify':
            cur.execute(f"""{reports} SELECT
                COUNT_IF(sr.CANONICAL_PLAYER_ID IS DISTINCT FROM k.PLAYER_KEY),
                COUNT_IF(sr.CANONICAL_FIXTURE_ID IS DISTINCT FROM k.FIXTURE_KEY),
                COUNT_IF(sr.CANONICAL_PLAYER_ID IS NULL AND k.PLAYER_STATUS <> 'resolved'), COUNT(*)
                FROM k JOIN {schema}.SCOUT_REPORTS sr ON sr.ID = k.ID""")
            p, f, unresolved, total = cur.fetchone()
            result['reports'] = {'player_mismatch': p, 'fixture_mismatch': f, 'unresolved_left_null': unresolved, 'rows': total}
            cur.execute(f"""{lists} SELECT COUNT_IF(i.CANONICAL_PLAYER_ID IS DISTINCT FROM k.PLAYER_KEY), COUNT(*)
                FROM k JOIN {schema}.PLAYER_LIST_ITEMS i ON i.ID = k.ID""")
            p, total = cur.fetchone()
            result['list_items'] = {'player_mismatch': p, 'rows': total}
            result['passed'] = not (result['reports']['player_mismatch'] or result['reports']['fixture_mismatch']
                                    or result['list_items']['player_mismatch'])
    except Exception:
        if args.mode == 'backfill':
            cur.execute('ROLLBACK')
        raise
    finally:
        conn.close()
    return result


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--env-file', required=True)
    p.add_argument('--schema', required=True, help='CORE or an isolated CORE_DEV_CODEX_* schema')
    p.add_argument('--mode', required=True, choices=['dry-run', 'add-columns', 'backfill', 'verify'])
    p.add_argument('--execute-production', action='store_true')
    p.add_argument('--result', type=Path)
    a = p.parse_args()
    out = run(a)
    text = json.dumps(out, indent=2, default=str)
    print(text)
    if a.result:
        a.result.write_text(text + '\n')
    if a.mode == 'verify' and not out.get('passed'):
        sys.exit(1)
