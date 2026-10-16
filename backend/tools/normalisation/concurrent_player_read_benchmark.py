"""Bounded concurrent read benchmark: old player reads vs the native projection.

Read-only. Runs against an isolated CORE_DEV_CODEX_* clone and compares three
player sources under the same concurrent, interleaved workload:

  old_live      CAFC_DB.APP_COMPAT.PLAYERS, the view production reads today
  old_snapshot  <clone>.PLAYER_READ_BEFORE_BACKUP, the frozen pre-release table
  native        canonical_players.projection(<clone>)

Every worker owns one connection, disables the result cache, sets a statement
timeout and query tag, and picks the mode round-robin per request so warehouse
contention and warm-up drift fall equally on every mode. The run is bounded by
--requests and --max-seconds, whichever comes first. Results record latency
percentiles, errors, concurrency, warehouse and duration; no row content is
written out.
"""
import argparse
import itertools
import json
import random
import re
import statistics
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from connection import connect, isolated_schema

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import canonical_players  # noqa: E402

MUTATION = re.compile(r'\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|COPY|PUT)\b', re.I)
SESSION_SETTINGS = re.compile(r'^\s*ALTER\s+SESSION\s+SET\s+(USE_CACHED_RESULT|STATEMENT_TIMEOUT_IN_SECONDS|QUERY_TAG)\s*=', re.I)

# Weighted to the app's player read paths: profile/detail lookups dominate,
# then search, then report and list pages joining players.
WORKLOAD = [('detail', 40), ('search', 25), ('report_join', 20), ('list_join', 15)]


def guarded(cursor, sql, params=None):
    clean = re.sub(r"'([^']|'')*'|/\*.*?\*/|--[^\n]*", '', sql, flags=re.S)
    if not SESSION_SETTINGS.match(clean) and (
            not re.match(r'^\s*(SELECT|WITH|SHOW|USE)\b', clean, re.I) or MUTATION.search(clean)):
        raise RuntimeError('Benchmark refused a non-read statement')
    return cursor.execute(sql, params)


def percentile(values, pct):
    if not values:
        return None
    ordered = sorted(values)
    rank = max(0, min(len(ordered) - 1, int(round(pct / 100 * len(ordered) + 0.5)) - 1))
    return round(ordered[rank], 4)


def summarise(samples):
    ok = [s['seconds'] for s in samples if s['error'] is None]
    errors = [s for s in samples if s['error'] is not None]
    return {'requests': len(samples), 'errors': len(errors),
            'error_rate': round(len(errors) / len(samples), 4) if samples else None,
            'p50': percentile(ok, 50), 'p95': percentile(ok, 95), 'p99': percentile(ok, 99),
            'mean': round(statistics.fmean(ok), 4) if ok else None, 'max': round(max(ok), 4) if ok else None}


def sample_parameters(cursor, schema, native, seed):
    rng = random.Random(seed)
    guarded(cursor, f'''SELECT DISTINCT PLAYERID FROM {native}
        WHERE PLAYERID IS NOT NULL AND SQUADNAME IS NOT NULL ORDER BY HASH(PLAYERID) LIMIT 2000''')
    players = [int(r[0]) for r in cursor.fetchall()]
    guarded(cursor, f'''SELECT DISTINCT sr.PLAYER_ID FROM {schema}.SCOUT_REPORTS sr
        JOIN {native} p ON sr.PLAYER_ID = p.PLAYERID ORDER BY HASH(sr.PLAYER_ID) LIMIT 500''')
    reported = [int(r[0]) for r in cursor.fetchall()]
    guarded(cursor, f'SELECT LIST_ID FROM {schema}.PLAYER_LIST_ITEMS GROUP BY LIST_ID')
    lists = [int(r[0]) for r in cursor.fetchall()]
    guarded(cursor, f'''SELECT PLAYERNAME FROM {native}
        WHERE PLAYERNAME IS NOT NULL ORDER BY HASH(CAFC_PLAYER_ID) LIMIT 500''')
    names = [r[0] for r in cursor.fetchall()]
    terms = sorted({canonical_norm(part) for name in names for part in name.split() if len(part) >= 4})
    if not (players and reported and lists and terms):
        raise RuntimeError('Clone lacks representative players, reports, lists or names')
    rng.shuffle(players); rng.shuffle(reported); rng.shuffle(terms)
    return {'players': players[:200], 'reported': reported[:200], 'lists': lists, 'terms': terms[:200]}


def canonical_norm(text):
    # Mirror the app's accent-insensitive search input without importing main.
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFKD', text) if not unicodedata.combining(c)).lower()


def build_query(kind, target, schema, params, rng):
    if kind == 'detail':
        return (f'SELECT PLAYERID,CAFC_PLAYER_ID,PLAYERNAME,SQUADNAME,POSITION FROM {target} WHERE PLAYERID=%s',
                (rng.choice(params['players']),))
    if kind == 'search':
        return (f'''SELECT PLAYERID,CAFC_PLAYER_ID,PLAYERNAME FROM {target}
            WHERE {schema}.NORMALIZE_TEXT_UDF(PLAYERNAME) ILIKE %s ORDER BY PLAYERNAME, CAFC_PLAYER_ID LIMIT 11''',
                ('%' + rng.choice(params['terms']) + '%',))
    if kind == 'report_join':
        return (f'''SELECT sr.ID,p.PLAYERNAME FROM {schema}.SCOUT_REPORTS sr
            LEFT JOIN {target} p ON sr.PLAYER_ID=p.PLAYERID WHERE sr.PLAYER_ID=%s ORDER BY sr.ID''',
                (rng.choice(params['reported']),))
    return (f'''SELECT i.ID,p.PLAYERNAME FROM {schema}.PLAYER_LIST_ITEMS i
        LEFT JOIN {target} p ON (i.PLAYER_ID=p.PLAYERID OR i.CAFC_PLAYER_ID=p.CAFC_PLAYER_ID)
        WHERE i.LIST_ID=%s''', (rng.choice(params['lists']),))


def run(env_file, name, concurrency, requests, warmup, max_seconds, timeout, modes, seed):
    schema = isolated_schema(name)
    native = canonical_players.projection(schema)
    targets = {'old_live': 'CAFC_DB.APP_COMPAT.PLAYERS',
               'old_snapshot': f'{schema}.PLAYER_READ_BEFORE_BACKUP', 'native': native}
    targets = {m: targets[m] for m in modes}
    run_id = uuid.uuid4().hex[:12]
    setup = connect(env_file)
    try:
        cur = setup.cursor()
        guarded(cur, f'USE SCHEMA {schema}')
        guarded(cur, 'SELECT CURRENT_ROLE(), CURRENT_WAREHOUSE(), CURRENT_VERSION()')
        role, warehouse, version = cur.fetchone()
        guarded(cur, f"SHOW WAREHOUSES LIKE '{warehouse}'")
        wh = dict(zip([d[0] for d in cur.description], cur.fetchone()))
        params = sample_parameters(cur, schema, native, seed)
    finally:
        setup.close()

    kinds = [k for k, w in WORKLOAD for _ in range(w)]
    lock = threading.Lock()
    counter = itertools.count()
    samples, validations, worker_errors = [], [], []
    deadline = {'at': None}
    stop = threading.Event()

    def worker(index):
        rng = random.Random(seed * 1000 + index)
        try:
            conn = connect(env_file)
        except Exception as exc:  # connection failure counts against the run, not a mode
            with lock:
                worker_errors.append({'worker': index, 'stage': 'connect', 'error': str(exc)[:300]})
            return
        try:
            c = conn.cursor()
            guarded(c, f'USE SCHEMA {schema}')
            guarded(c, 'ALTER SESSION SET USE_CACHED_RESULT=FALSE')
            guarded(c, f'ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS={int(timeout)}')
            guarded(c, f"ALTER SESSION SET QUERY_TAG='native-read-bench:{run_id}'")
            if 'native' in targets:
                # The app validates native sources on each new connection; time it separately.
                started = time.perf_counter()
                try:
                    canonical_players.validate(_GuardedCursor(c), schema)
                    validations.append({'worker': index, 'seconds': round(time.perf_counter() - started, 4), 'error': None})
                except Exception as exc:
                    validations.append({'worker': index, 'seconds': round(time.perf_counter() - started, 4), 'error': str(exc)[:300]})
            while not stop.is_set():
                n = next(counter)
                if n >= warmup + requests:
                    break
                if deadline['at'] is not None and time.monotonic() > deadline['at']:
                    stop.set(); break
                mode = list(targets)[n % len(targets)]
                kind = rng.choice(kinds)
                sql, args = build_query(kind, targets[mode], schema, params, rng)
                started = time.perf_counter(); error = None; rows = None; qid = None
                try:
                    guarded(c, sql, args); rows = len(c.fetchall()); qid = c.sfqid
                except Exception as exc:
                    error = str(exc)[:300]; qid = getattr(c, 'sfqid', None)
                sample = {'n': n, 'mode': mode, 'kind': kind, 'seconds': round(time.perf_counter() - started, 4),
                          'rows': rows, 'error': error, 'query_id': qid, 'warmup': n < warmup}
                with lock:
                    samples.append(sample)
        finally:
            conn.close()

    started_at = datetime.now(timezone.utc)
    wall = time.perf_counter()
    deadline['at'] = time.monotonic() + max_seconds
    threads = [threading.Thread(target=worker, args=(i,), daemon=True) for i in range(concurrency)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    duration = round(time.perf_counter() - wall, 2)

    measured = [s for s in samples if not s['warmup']]
    result = {
        'run_id': run_id, 'query_tag': f'native-read-bench:{run_id}', 'schema': schema,
        'started_at': started_at.isoformat(), 'duration_seconds': duration,
        'stopped_by_time_cap': stop.is_set(),
        'settings': {'concurrency': concurrency, 'requests': requests, 'warmup': warmup,
                     'max_seconds': max_seconds, 'statement_timeout_seconds': timeout,
                     'seed': seed, 'workload': dict(WORKLOAD), 'result_cache': 'disabled'},
        'session': {'role': role, 'warehouse': warehouse, 'version': version,
                    'warehouse_size': wh.get('size'), 'warehouse_state_at_start': wh.get('state'),
                    'min_cluster_count': wh.get('min_cluster_count'), 'max_cluster_count': wh.get('max_cluster_count'),
                    'scaling_policy': wh.get('scaling_policy')},
        'targets': {m: (t if m != 'native' else 'canonical_players.projection') for m, t in targets.items()},
        'by_mode': {m: summarise([s for s in measured if s['mode'] == m]) for m in targets},
        'by_mode_kind': {f'{m}.{k}': summarise([s for s in measured if s['mode'] == m and s['kind'] == k])
                         for m in targets for k, _ in WORKLOAD},
        'native_connection_validation': {
            'connections': len(validations),
            'errors': [v for v in validations if v['error']],
            'p50': percentile([v['seconds'] for v in validations if not v['error']], 50),
            'max': max([v['seconds'] for v in validations if not v['error']], default=None)},
        'worker_errors': worker_errors,
        'error_samples': [s for s in measured if s['error']][:20],
        'measured_requests': len(measured), 'warmup_requests': len(samples) - len(measured),
    }
    if 'old_live' in result['by_mode'] and 'native' in result['by_mode']:
        old, new = result['by_mode']['old_live'], result['by_mode']['native']
        result['native_vs_old_live'] = {
            k: round(new[k] / old[k], 3) if old[k] and new[k] else None for k in ('p50', 'p95', 'p99')}
    return result


class _GuardedCursor:
    """Lets canonical_players.validate run through the read-only guard."""
    def __init__(self, raw):
        self.raw = raw
    def execute(self, sql, params=None):
        guarded(self.raw, sql, params); return self
    def __getattr__(self, name):
        return getattr(self.raw, name)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--env-file', required=True)
    p.add_argument('--schema', required=True, help='Existing isolated CORE_DEV_CODEX_* clone')
    p.add_argument('--result', type=Path, required=True)
    p.add_argument('--concurrency', type=int, default=10)
    p.add_argument('--requests', type=int, default=600, help='Measured requests across all modes')
    p.add_argument('--warmup', type=int, default=30)
    p.add_argument('--max-seconds', type=int, default=600, help='Hard wall-clock cap')
    p.add_argument('--statement-timeout', type=int, default=60)
    p.add_argument('--modes', default='old_live,old_snapshot,native')
    p.add_argument('--seed', type=int, default=20261016)
    a = p.parse_args()
    if not 1 <= a.concurrency <= 32:
        p.error('--concurrency must be between 1 and 32')
    if not 1 <= a.requests <= 5000:
        p.error('--requests must be between 1 and 5000')
    modes = [m.strip() for m in a.modes.split(',') if m.strip()]
    if not set(modes) <= {'old_live', 'old_snapshot', 'native'}:
        p.error('unknown mode')
    out = run(a.env_file, a.schema, a.concurrency, a.requests, a.warmup, a.max_seconds,
              a.statement_timeout, modes, a.seed)
    a.result.write_text(json.dumps(out, indent=2, default=str) + '\n')
    print(json.dumps({k: out[k] for k in ('duration_seconds', 'stopped_by_time_cap', 'by_mode',
                                          'native_connection_validation', 'worker_errors')}
                     | ({'native_vs_old_live': out['native_vs_old_live']} if 'native_vs_old_live' in out else {}),
                     indent=2, default=str))
