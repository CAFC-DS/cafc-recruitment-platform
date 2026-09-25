"""
Tests for core_table() (Phase 6 sub-project 2): the helper that resolves a
table name to its fully-qualified CAFC_DB.CORE address, used once a table's
reads (not just writes) are cut over off the APP_COMPAT bridge.
"""
import main


def test_core_table_resolves_to_canonical_db_and_core_schema():
    assert main.core_table("scout_reports") == f"{main.CANONICAL_DB}.{main.CORE_DB_SCHEMA}.scout_reports"


def test_core_table_matches_write_table_in_the_deployed_full_cutover_state():
    # In production today, WRITE_DB is unset (defaults to CANONICAL_DB) and
    # CORE_DB_SCHEMA=CORE, so write_table() already resolves to CAFC_DB.CORE.
    # core_table() must resolve identically for any table name — it exists to
    # mark "this table's reads now go where its writes already do", not to
    # introduce a second address.
    assert main.core_table("scout_reports") == main.write_table("scout_reports")
    assert main.core_table("player_lists") == main.write_table("player_lists")
