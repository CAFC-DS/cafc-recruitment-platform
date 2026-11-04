"""Lists filter on average performance score (decimals) and on data score."""
import asyncio
import os
import sys
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import main


def test_score_in_range_handles_decimals_and_missing_scores():
    assert main.score_in_range(None, None, None)
    assert main.score_in_range(Decimal("6.7"), 6.5, 8.2)
    assert main.score_in_range(Decimal("6.5"), 6.5, None)
    assert main.score_in_range(Decimal("8.2"), None, 8.2)
    assert not main.score_in_range(Decimal("6.4"), 6.5, None)
    assert not main.score_in_range(Decimal("8.3"), None, 8.2)
    assert not main.score_in_range(None, 1, None)


def _fetch(**filters):
    """Runs the endpoint with two players; the database layer is faked by query text."""
    rows = {
        "lists": [(1, "RCB", None, 1, None, None, None, None, None)],
        "players": [
            (1, 11, 7, None, 0, None, 1, datetime(2026, 1, 1), "Stage 1", "Scored", "S", "Player", "CB", "Club", 25, "u", "external", 7),
            (1, 12, 8, None, 1, None, 1, datetime(2026, 1, 1), "Stage 1", "Unscored", "U", "Player", "CB", "Club", 25, "u", "external", 8),
        ],
    }
    stats = [(7, None, 3, Decimal("6.67"), 2, 1, datetime(2026, 1, 1))]
    cursor = MagicMock()
    cursor.description = []

    def execute(sql, *_args, **_kwargs):
        text = " ".join(str(sql).split())
        if "AVG(CASE WHEN sr.PERFORMANCE_SCORE" in text:
            cursor.fetchall.return_value = stats
        elif "player_list_items pli" in text.lower() or "pli.ID" in text or "CLUB_MOVE_PLAYER_ID" in text:
            cursor.fetchall.return_value = rows["players"]
        elif "player_lists pl" in text.lower() or "pl.LIST_NAME" in text:
            cursor.fetchall.return_value = rows["lists"]
        else:
            cursor.fetchall.return_value = []

    cursor.execute.side_effect = execute
    connection = MagicMock()
    connection.cursor.return_value = cursor
    defaults = dict(
        player_name=None, position=None, club=None, competition=None, min_age=None, max_age=None,
        min_score=None, max_score=None, performance_scores=None, min_data_score=None, max_data_score=None,
        min_reports=None, max_reports=None, stages=None, archived_reasons=None, initial_reasons=None,
        recency_months=None, include_archived=False, include_flags=False, category="first_team",
    )
    defaults.update(filters)
    score = {"kind": "career", "value": 103.4, "band": 3, "band_name": "Starter", "position": "CB", "season": "25/26", "seasons": 3, "min": 3000}
    with patch.object(main, "get_snowflake_connection", return_value=connection), \
         patch.object(main, "ensure_player_lists_category_column"), \
         patch.object(main.data_scores, "list_score", side_effect=lambda pid: score if pid == 7 else None):
        result = asyncio.run(main.get_all_lists_with_details(current_user=SimpleNamespace(id=1, role=main.ROLE_ADMIN), **defaults))
    return [p["player_name"] for lst in result["lists"] for p in lst["players"]]


def test_no_filters_returns_both_players():
    assert _fetch() == ["Scored", "Unscored"]


def test_decimal_performance_range_includes_the_rounded_average():
    assert _fetch(min_score=6.5, max_score=6.7) == ["Scored"]
    assert _fetch(min_score=6.8) == []
    assert _fetch(max_score=6.6) == []


def test_the_old_whole_score_filter_no_longer_crashes_on_a_decimal_average():
    assert _fetch(performance_scores="7") == ["Scored"]
    assert _fetch(performance_scores="6") == []


def test_data_score_range_uses_the_whole_number_shown_and_hides_players_without_one():
    assert _fetch(min_data_score=103, max_data_score=103) == ["Scored"]
    assert _fetch(min_data_score=104) == []
    assert _fetch(max_data_score=102) == []
    assert "Unscored" not in _fetch(min_data_score=1)
