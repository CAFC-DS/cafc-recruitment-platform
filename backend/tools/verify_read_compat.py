"""
Read-compatibility harness: run the app's REAL recommendation read endpoints against a chosen schema and
dump every response to JSON, so two runs (e.g. before / after a swap) can be diffed.

    CORE_DB_SCHEMA=CORE_DEV_NORMALIZATION python tools/verify_read_compat.py before.json
    CORE_DB_SCHEMA=CORE_DEV_SWAP          python tools/verify_read_compat.py after.json
    python tools/verify_read_compat.py --diff before.json after.json

It imports backend/main.py and calls the endpoint functions directly (no HTTP server), so the SQL executed is
exactly what production runs. Read-only: it never calls the app's startup loader (which runs
CREATE TABLE IF NOT EXISTS) and only invokes GET endpoints. Uses the same Snowflake environment variables as
run_normalization_migrations.py.
"""
import asyncio
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

APP_TABLES_FOR_SCHEMA_CACHE = [
    "users", "players", "scout_reports", "player_information", "player_notes", "matches", "player_lists",
    "player_list_items", "player_stage_history", "player_recommendations", "agent_profiles", "status_history",
]


def _jsonable(obj):
    if hasattr(obj, "model_dump"):
        return _jsonable(obj.model_dump())
    if isinstance(obj, dict):
        return {str(k): _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonable(v) for v in obj]
    if hasattr(obj, "body"):  # Starlette response (csv export)
        body = obj.body
        return body.decode("utf-8", "replace") if isinstance(body, (bytes, bytearray)) else str(body)
    return obj if isinstance(obj, (str, int, float, bool, type(None))) else str(obj)


def diff(a_path, b_path):
    a, b = json.load(open(a_path)), json.load(open(b_path))
    bad = [k for k in sorted(set(a) | set(b)) if a.get(k) != b.get(k)]
    print(f"{len(a)} vs {len(b)} calls compared; {len(bad)} differ")
    for k in bad[:25]:
        print("  DIFFERS:", k)
    return 1 if bad else 0


async def run(out_path):
    os.environ.setdefault("SECRET_KEY", "verify-read-compat-not-a-real-key")
    os.environ.setdefault("ENVIRONMENT", "development")
    from run_normalization_migrations import connect

    import main  # noqa: WPS433 - deliberate late import after env is set

    class SharedConnection:
        """One login for the whole run: the endpoints call get_snowflake_connection() and close() on every request."""

        def __init__(self):
            self._conn = connect()

        def cursor(self, *a, **k):
            return self._conn.cursor(*a, **k)

        def commit(self):
            pass

        def rollback(self):
            pass

        def close(self):  # endpoints close after each call; keep the shared session open
            pass

        def __getattr__(self, name):
            return getattr(self._conn, name)

    shared = SharedConnection()
    # The app re-DESCRIBEs the APP_COMPAT view on every request (identical in both runs, and this harness fills the same
    # cache up front), which made a full run take over an hour. Skipping it does not change any SQL being compared.
    main.refresh_table_schema = lambda table_name: None
    main.get_snowflake_connection = lambda: shared  # use this session's credentials, one login

    conn = shared
    cur = conn.cursor()
    # A production connection has its default schema set (SNOWFLAKE_SCHEMA); the app calls NORMALIZE_TEXT_UDF by its
    # bare name, which resolves through it. Mirror that with the TARGET schema so unqualified names stay inside it.
    cur.execute(f"USE SCHEMA {main.CANONICAL_DB}.{main.CORE_DB_SCHEMA}")
    # Same discovery the app's startup loader does, minus its DDL: DESCRIBE what the app reads.
    for name in APP_TABLES_FOR_SCHEMA_CACHE:
        try:
            cur.execute(f"DESCRIBE TABLE {main.read_table(name)}")
            main.TABLE_SCHEMA_CACHE[name] = [r[0] for r in cur.fetchall()]
        except Exception as exc:  # noqa: BLE001
            main.TABLE_SCHEMA_CACHE[name] = []
            print(f"  (no schema cache for {name}: {str(exc)[:80]})")
    print(f"schema: core_table('player_recommendations') -> {main.core_table('player_recommendations')}")

    cur.execute(f"SELECT ID FROM {main.core_table('player_recommendations')} ORDER BY ID")
    all_ids = [r[0] for r in cur.fetchall()]
    cur.execute(f"SELECT ID, USERNAME, ROLE FROM {main.core_table('users')} WHERE ROLE = 'admin' ORDER BY ID LIMIT 1")
    admin = cur.fetchone()
    cur.execute(
        f"SELECT u.ID, u.USERNAME FROM {main.core_table('users')} u JOIN {main.core_table('player_recommendations')} r "
        f"ON r.SUBMITTED_BY_USER_ID = u.ID GROUP BY u.ID, u.USERNAME ORDER BY COUNT(*) DESC, u.ID LIMIT 6"
    )
    agents = cur.fetchall()
    cur.close()

    staff = main.User(id=admin[0], username=admin[1], role="admin")
    results = {}

    async def call(label, fn, *args, **kwargs):
        try:
            res = await fn(*args, **kwargs)
            results[label] = _jsonable(res)
        except Exception as exc:  # noqa: BLE001 - an error is a result too (must match between runs)
            detail = getattr(exc, "detail", None)
            results[label] = {"__error__": type(exc).__name__, "detail": str(detail if detail else exc)[:200]}

    base = dict(status_filter=None, agent_user_id=None, created_from=None, created_to=None, player_name=None,
                position=None, age_min=None, age_max=None, deal_type=None, transfer_fee_min=None,
                transfer_fee_max=None, expected_salary_min=None, expected_salary_max=None, sort_by=None,
                sort_order="desc", page=1, page_size=100, current_user=staff)

    scenarios = {
        "all": {},
        "status_submitted": {"status_filter": "Submitted"},
        "status_review": {"status_filter": "Under Review"},
        "status_not_considered": {"status_filter": "Not Currently under Consideration"},
        "position_CM": {"position": "CM"},
        "position_GK": {"position": "GK"},
        "position_RB": {"position": "RB"},
        "deal_free": {"deal_type": "Free"},
        "deal_permanent": {"deal_type": "Permanent Transfer"},
        "deal_loan": {"deal_type": "Loan"},
        "age_20_24": {"age_min": 20, "age_max": 24},
        "fee_range": {"transfer_fee_min": 100000, "transfer_fee_max": 3000000},
        "salary_range": {"expected_salary_min": 5000, "expected_salary_max": 20000},
        "name_search": {"player_name": "a"},
        "dates": {"created_from": "2026-01-01", "created_to": "2026-06-30"},
        "combined": {"position": "CM", "deal_type": "Permanent Transfer", "status_filter": "Not Currently under Consideration"},
    }
    for sort in (None, "created_at", "player_name", "transfer_fee", "expected_wages", "status", "agent_name"):
        for order in ("asc", "desc"):
            scenarios[f"sort_{sort}_{order}"] = {"sort_by": sort, "sort_order": order}
    for label, extra in scenarios.items():
        # the unfiltered list is paged to the end so EVERY recommendation appears in a list response
        for page in ((1, 2, 3, 4, 5, 6, 7) if label == "all" else (1, 2)):
            await call(f"internal_list::{label}::p{page}", main.list_internal_recommendations, **{**base, **extra, "page": page})

    for agent_id in {a[0] for a in agents}:
        await call(f"internal_list::agent_{agent_id}", main.list_internal_recommendations, **{**base, "agent_user_id": agent_id})
    await call("filters_meta", main.get_internal_recommendation_filters_meta, current_user=staff)
    await call("export_csv", main.export_internal_recommendations_csv, current_user=staff)

    # Detail runs the app's heaviest query per id, so check a spread of ids plus the known edge cases (6402 was the
    # row whose legacy columns disagreed), not all of them; every row is already covered by the paged list above.
    edge_ids = {6402, all_ids[0], all_ids[-1]}
    detail_ids = sorted(set(all_ids[:: max(1, len(all_ids) // 45)]) | (edge_ids & set(all_ids)))
    for rid in detail_ids:
        await call(f"internal_detail::{rid}", main.get_internal_recommendation_detail, rid, current_user=staff)
    for rid in all_ids[:: max(1, len(all_ids) // 40)]:
        await call(f"internal_status_history::{rid}", main.get_internal_recommendation_history, rid, current_user=staff)
        await call(f"internal_notes_history::{rid}", main.get_internal_recommendation_notes_history, rid, current_user=staff)

    for agent_id, username in agents:
        agent = main.User(id=agent_id, username=username, role="agent")
        await call(f"agent_list::{agent_id}", main.list_agent_recommendations, current_user=agent)

    with open(out_path, "w") as fh:
        json.dump(results, fh, sort_keys=True, default=str)
    errors = sum(1 for v in results.values() if isinstance(v, dict) and "__error__" in v)
    digest = hashlib.sha256(json.dumps(results, sort_keys=True, default=str).encode()).hexdigest()[:16]
    print(f"{len(results)} endpoint calls recorded ({errors} returned an error result) -> {out_path}  sha={digest}")


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--diff":
        sys.exit(diff(sys.argv[2], sys.argv[3]))
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    asyncio.run(run(sys.argv[1]))
