"""Canonical key writers are no-ops until CORE has the columns, and never fail a save."""
import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main


def _cursor(columns):
    cur = MagicMock()
    cur.fetchall.return_value = [(c,) for c in columns]
    return cur


def setup_function(_):
    main._CORE_COLUMN_CACHE.clear()


def _updates(cur):
    return [c.args[0] for c in cur.execute.call_args_list if c.args[0].lstrip().startswith("UPDATE")]


def test_report_keys_skipped_while_columns_missing():
    cur = _cursor(["ID", "PLAYER_ID"])
    main.record_report_canonical_keys(cur, 5, (11, 22), None)
    assert _updates(cur) == []


def test_report_keys_written_from_player_row_and_match():
    cur = _cursor(["ID", "CANONICAL_PLAYER_ID", "CANONICAL_FIXTURE_ID"])
    with patch.object(main, "find_match_by_any_id", return_value=((900, 77, "a", "b", None, "external"), "external")):
        main.record_report_canonical_keys(cur, 5, (11, 22), 900)
    update = [c for c in cur.execute.call_args_list if c.args[0].startswith("UPDATE")][0]
    assert update.args[1] == (22, 77, 5)


def test_report_key_failure_does_not_raise():
    cur = _cursor(["CANONICAL_PLAYER_ID", "CANONICAL_FIXTURE_ID"])
    def boom(sql, *a, **k):
        if sql.startswith("UPDATE"):
            raise RuntimeError("db")
    cur.execute.side_effect = boom
    main.record_report_canonical_keys(cur, 5, (11, 22), None)


def test_missing_column_rechecked_after_interval():
    cur = _cursor(["ID"])
    assert not main.core_table_has_columns(cur, "scout_reports", "CANONICAL_PLAYER_ID")
    cur.fetchall.return_value = [("CANONICAL_PLAYER_ID",)]
    assert not main.core_table_has_columns(cur, "scout_reports", "CANONICAL_PLAYER_ID")
    cols, fetched = main._CORE_COLUMN_CACHE["scout_reports"]
    main._CORE_COLUMN_CACHE["scout_reports"] = (cols, fetched - main._CORE_COLUMN_RECHECK_SECONDS - 1)
    assert main.core_table_has_columns(cur, "scout_reports", "CANONICAL_PLAYER_ID")


def test_list_key_skips_ambiguous_player():
    cur = _cursor(["CANONICAL_PLAYER_ID"])
    main.core_table_has_columns(cur, "player_list_items", "CANONICAL_PLAYER_ID")
    cur.fetchall.return_value = [(1,), (2,)]
    main.record_list_item_canonical_key(cur, 3, 100, None)
    assert _updates(cur) == []


def test_merge_repoints_both_tables_when_columns_exist():
    cur = _cursor(["CANONICAL_PLAYER_ID"])
    main.repoint_canonical_player(cur, 5, 9)
    assert len(_updates(cur)) == 2
