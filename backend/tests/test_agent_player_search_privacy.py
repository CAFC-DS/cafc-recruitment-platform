"""Agent player search must not expose internal scouting scores."""
import asyncio
import os
import sys
from datetime import date
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import main


def test_agent_search_excludes_scores_from_results_and_suggestions():
    cursor = MagicMock()
    # Include a legacy score value to verify it cannot reach the response.
    cursor.fetchall.side_effect = [
        [("Jon Smith", date(2000, 1, 1), 8.5, None, 42, "external", "Charlton", "CB")],
        [("John Smith", date(2001, 1, 1), 9.0, None, 43, "external", "Other", "CM", 95)],
    ]
    connection = MagicMock()
    connection.cursor.return_value = cursor
    with patch.object(main, "validate_recommendation_schema_ready"), \
         patch.object(main, "get_snowflake_connection", return_value=connection), \
         patch.object(main, "get_table_columns", return_value={"PLAYERNAME", "BIRTHDATE", "PLAYERID", "SQUADNAME", "POSITION"}), \
         patch.object(main, "read_table", return_value="players"):
        response = asyncio.run(main.search_agent_players(query="Jon", current_user=MagicMock()))

    assert response.results[0].universal_id == "external_42"
    assert response.suggestions[0].universal_id == "external_43"
    for player in response.results + response.suggestions:
        assert "avg_performance_score" not in player.model_dump()
    for call in cursor.execute.call_args_list:
        sql = call.args[0].lower()
        assert "scout_reports" not in sql
        assert "performance_score" not in sql
    connection.close.assert_called_once()
