"""Agents must only reach their own portal API, and never receive internal scores."""
import os
import re
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import main

SCORE_FIELD = re.compile(r"score|rating|grade", re.I)


def _depends_on_login(dependant):
    return any(d.call is main.get_current_user or _depends_on_login(d) for d in dependant.dependencies)


LOGIN_ROUTES = [
    (method, route.path)
    for route in main.app.routes
    if isinstance(route, APIRoute) and _depends_on_login(route.dependant)
    for method in sorted(route.methods - {"HEAD", "OPTIONS"})
]


def _url(path):
    return re.sub(r"\{[^}]+\}", "1", path)


def _headers(role):
    token = main.create_access_token(data={"sub": "someone", "role": role, "user_id": 1})
    return {"Authorization": f"Bearer {token}"}


def _user(role):
    return SimpleNamespace(id=1, username="someone", role=role, email="x@example.com", firstname="A", lastname="B")


@pytest.fixture(autouse=True)
def signing_key(monkeypatch):
    monkeypatch.setattr(main, "SECRET_KEY", "test-only-signing-key")
    monkeypatch.setattr(main, "ALGORITHM", "HS256")


@pytest.fixture
def client():
    # No `with`: startup would open Snowflake. Any database call fails the request.
    return TestClient(main.app, raise_server_exceptions=False)


def test_the_route_list_covers_the_internal_routes():
    assert ("GET", "/players/{player_id}/profile") in LOGIN_ROUTES
    assert ("GET", "/players/{player_id}/attributes") in LOGIN_ROUTES
    assert ("GET", "/players/{player_id}/scout-reports") in LOGIN_ROUTES
    assert ("GET", "/agents/recommendations") in LOGIN_ROUTES
    assert len(LOGIN_ROUTES) > 100


@pytest.mark.parametrize(
    "method,path",
    [(m, p) for m, p in LOGIN_ROUTES if not main.agent_may_access(p)],
    ids=lambda value: value,
)
def test_agents_are_refused_on_every_route_outside_their_allowlist(client, method, path):
    with patch.object(main, "get_user", AsyncMock(return_value=_user(main.ROLE_AGENT))), \
         patch.object(main, "get_snowflake_connection", side_effect=AssertionError("database reached")) as connect:
        response = client.request(method, _url(path), headers=_headers(main.ROLE_AGENT))
    assert response.status_code == 403, f"{method} {path} returned {response.status_code}"
    connect.assert_not_called()


@pytest.mark.parametrize("path", ["/agents/me", "/agents/recommendations", "/users/me", "/auth/refresh"])
def test_the_gate_lets_agents_through_to_their_portal(path):
    assert main.agent_may_access(path)


@pytest.mark.parametrize("path", ["/agentsfoo", "/agents", "/users/me/other", "/players/1/profile", "/internal/recommendations"])
def test_the_allowlist_has_no_near_misses(path):
    assert not main.agent_may_access(path)


def test_agents_keep_their_token_refresh_and_identity(client):
    with patch.object(main, "get_user", AsyncMock(return_value=_user(main.ROLE_AGENT))):
        assert client.post("/auth/refresh", headers=_headers(main.ROLE_AGENT)).status_code == 200


@pytest.mark.parametrize("role", [main.ROLE_ADMIN, main.ROLE_SENIOR_MANAGER, main.ROLE_MANAGER, main.ROLE_SCOUT, main.ROLE_LOAN_MANAGER])
def test_other_roles_are_not_stopped_by_the_agent_gate(client, role):
    with patch.object(main, "get_user", AsyncMock(return_value=_user(role))), \
         patch.object(main, "get_snowflake_connection", side_effect=RuntimeError("no database in tests")):
        response = client.get("/players/external_1/profile", headers=_headers(role))
    assert response.json().get("detail") != "Not available to agent accounts"


def test_the_agent_response_has_no_score_fields():
    assert [f for f in main.RecommendationResponse.model_fields if SCORE_FIELD.search(f)] == []


def _row():
    row = [None] * 54
    row[0], row[6], row[25], row[35] = 1, "Jon Smith", "Submitted", 8.5
    return row


def test_a_scored_player_is_stripped_from_the_agent_response_but_kept_internally():
    agent = main.serialize_recommendation_row(_row())
    assert "avg_performance_score" not in agent.model_dump()
    assert "8.5" not in agent.model_dump_json()
    assert main.serialize_recommendation_row(_row(), include_internal=True).avg_performance_score == 8.5


def test_the_agent_endpoints_declare_the_agent_response_model():
    for route in main.app.routes:
        if isinstance(route, APIRoute) and route.path.startswith("/agents/recommendations") and "supporting-file" not in route.path \
                and "history" not in route.path:
            assert route.response_model is not main.InternalRecommendationResponse, route.path
