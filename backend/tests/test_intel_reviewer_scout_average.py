"""Intel Reviewers can read recommendations but must never receive the scout average."""
import os
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import main


def _row():
    row = [None] * 54
    row[0], row[6], row[25], row[35] = 1, "Jon Smith", "Submitted", 8.5
    return row


@pytest.fixture
def get_as():
    cursor = MagicMock()
    cursor.fetchone.return_value = (1,)
    cursor.fetchall.return_value = [_row()]
    connection = MagicMock()
    connection.cursor.return_value = cursor
    client = TestClient(main.app)

    def request(role, path):
        main.app.dependency_overrides[main.get_current_user] = lambda: SimpleNamespace(id=1, role=role, username="u", email="e", firstname="", lastname="")
        with patch.object(main, "validate_recommendation_schema_ready"), \
             patch.object(main, "get_snowflake_connection", return_value=connection), \
             patch.object(main, "build_recommendation_select", return_value="SELECT 1"), \
             patch.object(main, "fetch_recommendation_detail", return_value=_row()), \
             patch.object(main, "fetch_recommendation_status_history", return_value=[]):
            response = client.get(path)
        assert response.status_code == 200, response.text
        return response

    yield request
    main.app.dependency_overrides.clear()


def _list_item(response):
    return response.json()["items"][0]


def test_intel_reviewer_list_has_no_scout_average(get_as):
    response = get_as(main.ROLE_INTEL_REVIEWER, "/internal/recommendations")
    assert _list_item(response)["avg_performance_score"] is None
    assert "8.5" not in response.text


def test_intel_reviewer_detail_has_no_scout_average(get_as):
    response = get_as(main.ROLE_INTEL_REVIEWER, "/internal/recommendations/1")
    assert response.json()["avg_performance_score"] is None
    assert "8.5" not in response.text


@pytest.mark.parametrize("role", [main.ROLE_ADMIN, main.ROLE_SENIOR_MANAGER, main.ROLE_MANAGER])
def test_other_roles_keep_the_scout_average(get_as, role):
    assert _list_item(get_as(role, "/internal/recommendations"))["avg_performance_score"] == 8.5
    assert get_as(role, "/internal/recommendations/1").json()["avg_performance_score"] == 8.5


def _depends_on(dependant, target):
    return any(d.call is target or _depends_on(d, target) for d in dependant.dependencies)


def test_every_route_open_to_intel_reviewers_is_accounted_for():
    # A new recommendation route readable by Intel Reviewers must also withhold the average.
    routes = {
        route.path for route in main.app.routes
        if isinstance(route, APIRoute) and _depends_on(route.dependant, main.require_recs_viewer)
        and route.response_model is main.InternalRecommendationResponse
    }
    assert routes == {"/internal/recommendations/{recommendation_id}"}


SCOUT_REPORT_ROUTES = [
    "/scout_reports/recent",
    "/scout_reports/top-attributes",
    "/scout_reports/1",
    "/scout_reports/details/1",
    "/players/external_1/export-pdf",
]


def _as(role):
    main.app.dependency_overrides[main.get_current_user] = lambda: SimpleNamespace(id=1, role=role, username="u", email="e", firstname="", lastname="")


@pytest.mark.parametrize("path", SCOUT_REPORT_ROUTES)
def test_intel_reviewers_are_refused_scout_report_content(path):
    _as(main.ROLE_INTEL_REVIEWER)
    try:
        with patch.object(main, "get_snowflake_connection", side_effect=AssertionError("database reached")) as connect:
            response = TestClient(main.app, raise_server_exceptions=False).get(path)
    finally:
        main.app.dependency_overrides.clear()
    assert response.status_code == 403
    connect.assert_not_called()


@pytest.mark.parametrize("path", SCOUT_REPORT_ROUTES)
@pytest.mark.parametrize("role", [main.ROLE_ADMIN, main.ROLE_SENIOR_MANAGER, main.ROLE_MANAGER, main.ROLE_SCOUT, main.ROLE_LOAN_MANAGER])
def test_other_roles_pass_the_scout_report_check(path, role):
    _as(role)
    try:
        with patch.object(main, "get_snowflake_connection", side_effect=RuntimeError("no database in tests")):
            response = TestClient(main.app, raise_server_exceptions=False).get(path)
    finally:
        main.app.dependency_overrides.clear()
    assert response.status_code != 403
