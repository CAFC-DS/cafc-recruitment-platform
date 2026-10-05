"""Exercise list response enrichment using the existing external identity seam."""
import asyncio
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
import main


@pytest.mark.parametrize("list_player_id,internal_id,mapped_id,category,has_move", [
    (161255, None, 161255, "first_team", True),
    (None, 999, 161255, "first_team", True),
    (None, 161255, None, "first_team", False),
    (161255, None, 161255, "emerging_talent_u21", False),
    (-1, None, -1, "first_team", False),
])
def test_list_detail_enriches_only_external_identity(monkeypatch, list_player_id, internal_id, mapped_id, category, has_move):
    cursor = MagicMock()
    now = datetime(2026, 10, 5)
    cursor.fetchone.return_value = (1, "Test list", None, 1, now, now, category)
    player = (10, list_player_id, internal_id, 0, None, 1, now, "Player", None, None, "CB", "Club", None, "admin", "Stage 1", mapped_id)
    cursor.fetchall.side_effect = [[("STAGE",)], [player], []]
    connection = MagicMock()
    connection.cursor.return_value = cursor
    monkeypatch.setattr(main, "get_snowflake_connection", lambda: connection)
    monkeypatch.setattr(main, "ensure_player_lists_category_column", lambda cursor: None)
    result = asyncio.run(main.get_player_list_detail(1, current_user=SimpleNamespace(role=main.ROLE_ADMIN)))
    assert (result["players"][0]["club_move"] is not None) == has_move
    player_query = cursor.execute.call_args_list[2].args[0]
    assert "COALESCE(pli.PLAYER_ID, p.PLAYERID, club_identity.external_player_id) AS CLUB_MOVE_PLAYER_ID" in player_query
    assert "source_system = 'IMPECT'" in player_query
    assert "HAVING COUNT(DISTINCT source_player_id) = 1" in player_query
    connection.close.assert_called_once()


@pytest.mark.parametrize("category,has_move", [("first_team", True), ("emerging_talent_u21", False)])
def test_bulk_lists_preserve_moves_across_memberships_and_filters(monkeypatch, category, has_move):
    cursor = MagicMock()
    now = datetime(2026, 10, 5)
    lists = [(i, "List", None, 1, now, now, "admin", None, None) for i in (1, 2)]
    players = [(i, i * 10, 161255, None, 0, None, 1, now, "Stage 1", "Player", None, None, "CB", "Club", 24, "admin", "external", 161255) for i in (1, 2)]
    def fetch():
        query = cursor.execute.call_args.args[0]
        if "FROM" in query and "pl.LIST_CATEGORY" in query:
            return lists
        if "AS CLUB_MOVE_PLAYER_ID" in query:
            return players
        return []
    cursor.fetchall.side_effect = fetch
    connection = MagicMock()
    connection.cursor.return_value = cursor
    monkeypatch.setattr(main, "get_snowflake_connection", lambda: connection)
    monkeypatch.setattr(main, "ensure_player_lists_category_column", lambda cursor: None)
    result = asyncio.run(main.get_all_lists_with_details(category=category, player_name="Player", stages="Stage 1", min_reports=0, current_user=SimpleNamespace(role=main.ROLE_ADMIN)))
    moves = [entry["players"][0]["club_move"] for entry in result["lists"]]
    assert len(moves) == 2
    assert moves[0] == moves[1]
    assert (moves[0] is not None) == has_move
