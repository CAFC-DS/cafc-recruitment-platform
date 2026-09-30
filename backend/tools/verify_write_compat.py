"""
Write-equivalence harness: run the same WRITE scenarios through the app's REAL endpoint functions against two
schemas and compare the outcome.

    CORE_DB_SCHEMA=CORE_DEV_NORMALIZATION python tools/verify_write_compat.py recommendations legacy.json    # legacy path
    CORE_DB_SCHEMA=CORE_DEV_SWAP          python tools/verify_write_compat.py recommendations normalized.json  # normalized path
    python tools/verify_write_compat.py --diff legacy.json normalized.json

The first schema still has the legacy TABLE (write flag off); the second has been swapped (legacy name is a view,
write flag on). Each scenario records (a) the endpoint's response and (b) the resulting LEGACY-SHAPED rows read back
through the legacy names, with only ids and timestamps scrubbed. If the normalized write path is faithful the two
recordings are identical.

SAFETY: this WRITES. It refuses to run unless CORE_DB_SCHEMA starts with CORE_DEV_ (a clone), never live CORE.
"""
import asyncio
import importlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

CACHE_TABLES = ["users", "players", "scout_reports", "player_information", "player_notes", "matches", "player_lists",
                "player_list_items", "player_stage_history", "player_recommendations", "agent_profiles", "status_history"]
TIME_KEYS = re.compile(r"(?i)(^|_)(created_at|updated_at|changed_at|viewed_at|last_accessed|expires_at|.*_at)$")


def scrub(value, id_map=None):
    """Replace timestamps and (mapped) ids so two independent runs can be compared."""
    id_map = id_map if id_map is not None else {}
    if hasattr(value, "model_dump"):
        value = value.model_dump()
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if TIME_KEYS.search(str(key)) and item is not None:
                out[key] = "<ts>"
            elif str(key).lower() in ("id", "recommendation_id", "report_id", "list_item_id", "item_id") and item is not None:
                out[key] = id_map.setdefault(item, f"<id{len(id_map) + 1}>")
            else:
                out[key] = scrub(item, id_map)
        return out
    if isinstance(value, (list, tuple)):
        return [scrub(v, id_map) for v in value]
    if isinstance(value, (str, int, float, bool, type(None))):
        return value
    text = str(value)
    return "<ts>" if re.match(r"^\d{4}-\d\d-\d\d[ T]\d\d:\d\d", text) else text


def diff(a_path, b_path):
    a, b = json.load(open(a_path)), json.load(open(b_path))
    bad = [k for k in sorted(set(a) | set(b)) if a.get(k) != b.get(k)]
    print(f"{len(a)} vs {len(b)} recorded steps compared; {len(bad)} differ")
    for k in bad[:30]:
        print("  DIFFERS:", k)
        print("     legacy    :", json.dumps(a.get(k), default=str)[:700])
        print("     normalized:", json.dumps(b.get(k), default=str)[:700])
    return 1 if bad else 0


class Context:
    """What a scenario module needs: the imported app, one shared cursor, and helpers."""

    def __init__(self, main, conn):
        self.main, self.conn = main, conn
        self.cursor = conn.cursor()
        self.results = {}
        self.id_map = {}

    def rows(self, sql, params=None):
        self.cursor.execute(sql, params or ())
        return [list(r) for r in self.cursor.fetchall()]

    def record(self, label, value):
        self.results[label] = scrub(value, self.id_map)

    async def call(self, label, fn, *args, **kwargs):
        """Call an endpoint; an HTTP error is a RESULT (it must match between the two paths)."""
        try:
            self.record(label, await fn(*args, **kwargs))
        except Exception as exc:  # noqa: BLE001
            detail = getattr(exc, "detail", None)
            self.record(label, {"__error__": type(exc).__name__, "status": getattr(exc, "status_code", None),
                                "detail": str(detail if detail else exc)[:200]})
            return None
        return self.results[label]


async def run(domain, out_path):
    schema = os.environ.get("CORE_DB_SCHEMA", "")
    if not schema.upper().startswith("CORE_DEV_"):
        sys.exit(f"refusing to run write scenarios against CORE_DB_SCHEMA={schema!r}: only CORE_DEV_* clones are allowed")
    os.environ.setdefault("SECRET_KEY", "verify-write-compat-not-a-real-key")
    os.environ.setdefault("ENVIRONMENT", "development")
    from run_normalization_migrations import connect

    import main  # noqa: WPS433

    assert main.CORE_DB_SCHEMA.upper().startswith("CORE_DEV_"), main.CORE_DB_SCHEMA

    class Shared:
        def __init__(self):
            self._c = connect()

        def cursor(self, *a, **k):
            return self._c.cursor(*a, **k)

        def commit(self):
            pass

        def rollback(self):
            pass

        def close(self):
            pass

        def __getattr__(self, n):
            return getattr(self._c, n)

    shared = Shared()
    main.get_snowflake_connection = lambda: shared
    main.refresh_table_schema = lambda table_name: None
    cur = shared.cursor()
    cur.execute(f"USE SCHEMA {main.CANONICAL_DB}.{main.CORE_DB_SCHEMA}")
    for name in CACHE_TABLES:
        cur.execute(f"DESCRIBE TABLE {main.read_table(name)}")
        main.TABLE_SCHEMA_CACHE[name] = [r[0] for r in cur.fetchall()]
    main.WRITE_FLAGS.invalidate()
    ctx = Context(main, shared)
    ctx.cursor.execute(f"SELECT normalized_writes FROM {main.core_table('app_write_flags')} WHERE domain = %s", (domain,))
    flag = ctx.cursor.fetchone()
    print(f"schema {main.CORE_DB_SCHEMA}: domain {domain!r} normalized writes = {bool(flag and flag[0])}")
    module = importlib.import_module(f"write_scenarios.{domain}")
    await module.run(ctx)
    with open(out_path, "w") as fh:
        json.dump(ctx.results, fh, sort_keys=True, default=str)
    errors = sum(1 for v in ctx.results.values() if isinstance(v, dict) and "__error__" in v)
    print(f"{len(ctx.results)} steps recorded ({errors} were expected error results) -> {out_path}")


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--diff":
        sys.exit(diff(sys.argv[2], sys.argv[3]))
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    asyncio.run(run(sys.argv[1], sys.argv[2]))
