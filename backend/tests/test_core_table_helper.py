"""
Tests for core_table() (Phase 6 sub-project 2): the helper that resolves a
table name to its fully-qualified CAFC_DB.CORE address, used once a table's
reads (not just writes) are cut over off the APP_COMPAT bridge.
"""
import main


def test_core_table_resolves_to_canonical_db_and_core_schema():
    assert main.core_table("scout_reports") == f"{main.CANONICAL_DB}.{main.CORE_DB_SCHEMA}.scout_reports"


def test_core_table_matches_write_table_in_the_deployed_full_cutover_state(monkeypatch):
    # Pin the module-level constants to the deployed full-cutover state:
    # CANONICAL_DB=CAFC_DB, CORE_DB_SCHEMA=CORE, WRITE_DB unset (so
    # WRITE_PREFIX == CANONICAL_DB.CORE_DB_SCHEMA, same as core_table()'s
    # own computation). These are computed once at import time from
    # os.getenv, so we monkeypatch the module attributes directly rather
    # than relying on env vars + re-import.
    monkeypatch.setattr(main, "CANONICAL_DB", "CAFC_DB")
    monkeypatch.setattr(main, "CORE_DB_SCHEMA", "CORE")
    monkeypatch.setattr(main, "WRITE_PREFIX", "CAFC_DB.CORE")

    assert main.core_table("scout_reports") == main.write_table("scout_reports") == "CAFC_DB.CORE.scout_reports"


def test_core_table_diverges_from_write_table_when_write_db_is_set(monkeypatch):
    # Simulate the documented "soak" state: WRITE_DB set to a different
    # database than CANONICAL_DB, so WRITE_PREFIX no longer matches what
    # core_table() computes from CANONICAL_DB/CORE_DB_SCHEMA. This proves
    # the two helpers are NOT always equivalent — they only match while
    # WRITE_DB is unset (true in production today, but not guaranteed).
    monkeypatch.setattr(main, "CANONICAL_DB", "CAFC_DB")
    monkeypatch.setattr(main, "CORE_DB_SCHEMA", "CORE")
    monkeypatch.setattr(main, "WRITE_PREFIX", "RECRUITMENT_TEST.CORE")

    assert main.core_table("scout_reports") != main.write_table("scout_reports")
