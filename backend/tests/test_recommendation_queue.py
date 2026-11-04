"""The agent recommendations queue: several statuses at once, and the counts behind its tabs."""
import os
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import main


@pytest.fixture
def get_list():
    cursor = MagicMock()
    cursor.fetchone.side_effect = [(3,), (632, 42)]
    cursor.fetchall.return_value = []
    connection = MagicMock()
    connection.cursor.return_value = cursor
    main.app.dependency_overrides[main.get_current_user] = lambda: SimpleNamespace(id=1, role=main.ROLE_ADMIN, username="u", email="e", firstname="", lastname="")

    def request(query=""):
        with patch.object(main, "validate_recommendation_schema_ready"), \
             patch.object(main, "get_snowflake_connection", return_value=connection), \
             patch.object(main, "build_recommendation_select", return_value="SELECT 1"):
            return TestClient(main.app).get(f"/internal/recommendations{query}"), cursor

    yield request
    main.app.dependency_overrides.clear()


def _list_query(cursor):
    return next(call for call in cursor.execute.call_args_list if "LIMIT" in call.args[0])


def test_filters_on_several_statuses(get_list):
    response, cursor = get_list("?status=Submitted,Under Review")
    assert response.status_code == 200
    call = _list_query(cursor)
    assert "rec.STATUS IN (%s, %s)" in call.args[0]
    assert call.args[1][:2] == ["Submitted", "Under Review"]


def test_a_single_status_with_a_slash_still_works(get_list):
    response, cursor = get_list("?status=Added / Already in Emerging Talent Process")
    assert response.status_code == 200
    assert _list_query(cursor).args[1][0] == "Added / Already in Emerging Talent Process"


def test_no_status_means_no_status_filter(get_list):
    response, cursor = get_list()
    assert response.status_code == 200
    assert "rec.STATUS IN" not in _list_query(cursor).args[0]


def test_an_unknown_status_is_refused(get_list):
    assert get_list("?status=Submitted,Nonsense")[0].status_code == 400


def test_returns_the_counts_for_the_queue_tabs(get_list):
    assert get_list()[0].json()["queue_counts"] == {"needs_decision": 42, "all": 632}
