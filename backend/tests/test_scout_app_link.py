"""
GET /scout-app/link: admins and senior managers get a presigned link to the
weekly scout app; other roles and agents are refused; nothing published yet
is a clear 503.

The bucket client is mocked, and the user lookup is patched so no Snowflake
connection is needed.
"""
import io
import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main

BUCKET_ENV = {
    "BUCKET": "scout-data-test",
    "ENDPOINT": "https://storage.example.test",
    "REGION": "auto",
    "ACCESS_KEY_ID": "test-key",
    "SECRET_ACCESS_KEY": "test-secret",
}


TEST_SECRET_KEY = "scout-app-test-secret"


def _token(username, role, user_id=1):
    with patch.object(main, "SECRET_KEY", TEST_SECRET_KEY):
        return main.create_access_token({"sub": username, "role": role, "user_id": user_id})


def _auth(role):
    return {"Authorization": f"Bearer {_token(role + '_user', role)}"}


async def _fake_get_user(username):
    role = username.rsplit("_user", 1)[0]
    return main.User(id=1, username=username, role=role, email=None, firstname=None, lastname=None)


@pytest.fixture
def client():
    with patch.object(main, "SECRET_KEY", TEST_SECRET_KEY), patch.object(main, "get_user", _fake_get_user), patch.dict(
        os.environ, BUCKET_ENV
    ):
        yield TestClient(main.app)


def _bucket(latest=None, error_code=None):
    bucket = MagicMock()
    if error_code:
        bucket.get_object.side_effect = ClientError({"Error": {"Code": error_code}}, "GetObject")
    else:
        bucket.get_object.return_value = {"Body": io.BytesIO(json.dumps(latest).encode())}
    bucket.generate_presigned_url.return_value = "https://storage.example.test/signed"
    return bucket


def test_requires_token(client):
    assert client.get("/scout-app/link").status_code == 401


def test_agent_is_refused(client):
    with patch.object(main, "scout_app_bucket_client") as make_bucket:
        response = client.get("/scout-app/link", headers=_auth("agent"))
    assert response.status_code == 403
    make_bucket.assert_not_called()


@pytest.mark.parametrize("role", ["intel_reviewer", "manager", "loan_manager", "scout"])
def test_other_roles_are_refused(client, role):
    with patch.object(main, "scout_app_bucket_client") as make_bucket:
        response = client.get("/scout-app/link", headers=_auth(role))
    assert response.status_code == 403
    make_bucket.assert_not_called()


@pytest.mark.parametrize("role", ["admin", "senior_manager"])
def test_scout_app_user_gets_presigned_link(client, role):
    latest = {"run_id": "20261101T0900Z", "built_at": "2026-11-01T09:42:00Z", "fit_id": "f1", "summary": {}}
    bucket = _bucket(latest)
    with patch.object(main, "scout_app_bucket_client", return_value=bucket):
        response = client.get("/scout-app/link", headers=_auth(role))
    assert response.status_code == 200
    assert response.json() == {"url": "https://storage.example.test/signed", "built_at": "2026-11-01T09:42:00Z"}
    bucket.get_object.assert_called_once_with(Bucket="scout-data-test", Key="published/latest.json")
    bucket.generate_presigned_url.assert_called_once_with(
        "get_object",
        Params={"Bucket": "scout-data-test", "Key": "published/20261101T0900Z/cafc_scout.html"},
        ExpiresIn=600,
    )


def test_nothing_published_is_503(client):
    with patch.object(main, "scout_app_bucket_client", return_value=_bucket(error_code="NoSuchKey")):
        response = client.get("/scout-app/link", headers=_auth("senior_manager"))
    assert response.status_code == 503
    assert "not been published" in response.json()["detail"]


def test_missing_bucket_config_is_503(client):
    with patch.dict(os.environ, {"BUCKET": ""}):
        response = client.get("/scout-app/link", headers=_auth("admin"))
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]


def test_storage_error_is_502(client):
    with patch.object(main, "scout_app_bucket_client", return_value=_bucket(error_code="AccessDenied")):
        response = client.get("/scout-app/link", headers=_auth("admin"))
    assert response.status_code == 502
