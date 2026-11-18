"""Internal intel counts on the lists page must survive identity resolution."""
import asyncio
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
import main


@pytest.mark.parametrize("list_player_id,list_cafc_id,expected", [
    (207061, None, 2),        # list item keyed by external ID only (the common case)
    (None, 1351345, 2),       # list item keyed by CAFC ID only
    (207061, 1351345, 2),     # both IDs present
    (999999, None, 0),        # unrelated player
])
def test_internal_intel_counted_when_resolution_adds_cafc_id(monkeypatch, list_player_id, list_cafc_id, expected):
    cursor = MagicMock()
    now = datetime(2026, 11, 18)
    lists = [(1, "List", None, 1, now, now, "admin", None, None)]
    players = [(1, 10, list_player_id, list_cafc_id, 0, None, 1, now, "Stage 1", "Hampus Skoglund",
                None, None, "RB", "Club", 24, "admin", "external", list_player_id)]

    def fetch():
        query = cursor.execute.call_args.args[0]
        if "FROM" in query and "pl.LIST_CATEGORY" in query:
            return lists
        if "ORDER BY pli.LIST_ID, pli.DISPLAY_ORDER" in query:
            return players
        if "intel_reports_count" in query:
            # Grouping sets: one row counted by PLAYER_ID, one by the resolved CAFC ID.
            return [(207061, None, 2, 0), (None, 1351345, 2, 1)]
        return []

    cursor.fetchall.side_effect = fetch
    connection = MagicMock()
    connection.cursor.return_value = cursor
    monkeypatch.setattr(main, "get_snowflake_connection", lambda: connection)
    monkeypatch.setattr(main, "ensure_player_lists_category_column", lambda cursor: None)
    result = asyncio.run(main.get_all_lists_with_details(min_reports=0, current_user=SimpleNamespace(role=main.ROLE_ADMIN)))
    assert result["lists"][0]["players"][0]["intel_reports_count"] == expected
