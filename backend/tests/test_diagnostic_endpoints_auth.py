"""
Diagnostic endpoints used to answer anyone on the internet.

/health/debug and /health/snowflake are admin only. /database/metadata is open
to internal roles, because the home page shows its counts to all staff, but not
to agents, intel reviewers or anonymous callers. Endpoints that must stay public
still answer without a token, so Railway and the login pages keep working.

The user lookup and Snowflake connection are patched so no database is needed.
"""
import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main

TEST_SECRET_KEY = "diagnostic-endpoints-test-secret"

ADMIN_ONLY_PATHS = ["/health/debug", "/health/snowflake"]
NON_ADMIN_ROLES = [
    main.ROLE_SENIOR_MANAGER,
    main.ROLE_MANAGER,
    main.ROLE_LOAN_MANAGER,
    main.ROLE_SCOUT,
    main.ROLE_AGENT,
    main.ROLE_INTEL_REVIEWER,
]
METADATA_PATH = "/database/metadata"
METADATA_DENIED_ROLES = [main.ROLE_AGENT, main.ROLE_INTEL_REVIEWER]


def _auth(role):
    token = main.create_access_token(
        {"sub": f"{role}_user", "role": role, "user_id": 1}
    )
    return {"Authorization": f"Bearer {token}"}


async def _fake_get_user(username):
    role = username.rsplit("_user", 1)[0]
    return main.User(
        id=1, username=username, role=role, email=None, firstname=None, lastname=None
    )


@pytest.fixture
def snowflake():
    conn = MagicMock()
    conn.cursor.return_value.fetchone.return_value = (1,)
    conn.cursor.return_value.fetchall.return_value = []
    with patch.object(main, "get_snowflake_connection", return_value=conn) as connect:
        yield connect


@pytest.fixture
def client(snowflake):
    with patch.object(main, "SECRET_KEY", TEST_SECRET_KEY), patch.object(
        main, "get_user", _fake_get_user
    ):
        yield TestClient(main.app)


@pytest.mark.parametrize("path", ADMIN_ONLY_PATHS + [METADATA_PATH])
def test_no_token_is_rejected(client, snowflake, path):
    response = client.get(path)
    assert response.status_code == 401
    snowflake.assert_not_called()


@pytest.mark.parametrize("path", ADMIN_ONLY_PATHS)
@pytest.mark.parametrize("role", NON_ADMIN_ROLES)
def test_non_admin_cannot_read_health_endpoints(client, snowflake, path, role):
    response = client.get(path, headers=_auth(role))
    assert response.status_code == 403
    snowflake.assert_not_called()


@pytest.mark.parametrize("path", ADMIN_ONLY_PATHS)
def test_admin_can_read_health_endpoints(client, path):
    assert client.get(path, headers=_auth(main.ROLE_ADMIN)).status_code == 200


@pytest.mark.parametrize("role", METADATA_DENIED_ROLES)
def test_external_roles_cannot_read_database_metadata(client, snowflake, role):
    response = client.get(METADATA_PATH, headers=_auth(role))
    assert response.status_code == 403
    snowflake.assert_not_called()


@pytest.mark.parametrize("role", main.INTERNAL_ROLES)
def test_internal_roles_keep_home_page_metadata(client, role):
    assert client.get(METADATA_PATH, headers=_auth(role)).status_code == 200


def test_root_stays_public(client):
    assert client.get("/").status_code == 200


@pytest.mark.parametrize(
    "method, path",
    [
        ("post", "/token"),
        ("post", "/agents/register"),
        ("post", "/agents/reset-password"),
        ("post", "/reset-password"),
        ("get", "/public/report/some-token"),
    ],
)
def test_public_routes_declare_no_login(method, path):
    """These must be reachable without a token, so none may depend on a login."""
    route = next(
        (
            r
            for r in main.app.routes
            if getattr(r, "methods", None)
            and method.upper() in r.methods
            and r.matches({"type": "http", "path": path, "method": method.upper()})[0].value == 2
        ),
        None,
    )
    assert route is not None, f"{method} {path} not found"
    called = [d.call for d in route.dependant.dependencies]
    assert main.get_current_user not in called
    assert main.require_internal_user not in called
