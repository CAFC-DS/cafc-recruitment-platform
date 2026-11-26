"""Agent contact book: who agents are, how to reach them, and what they've recommended."""
import os
import sys
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import main
from agent_contacts import merge_contact

USER = {"firstname": "Sam", "lastname": "Hartley", "username": "samh"}


def test_profile_values_win():
    merged, from_rec = merge_contact(
        {"name": "Sam Hartley", "agency": "Northpoint", "email": "sam@np.example", "phone": "+44 1"},
        {"name": "S H", "agency": "Old", "email": "old@x.example", "phone": "+44 9"},
        USER,
    )
    assert merged == {"name": "Sam Hartley", "agency": "Northpoint", "email": "sam@np.example", "phone": "+44 1"}
    assert from_rec is False


def test_blank_profile_field_falls_back_to_latest_rec():
    merged, from_rec = merge_contact(
        {"name": "Sam Hartley", "agency": "  ", "email": "sam@np.example", "phone": None},
        {"name": "x", "agency": "Northpoint", "email": "x@x.example", "phone": "+44 9"},
        USER,
    )
    assert merged["agency"] == "Northpoint"
    assert merged["phone"] == "+44 9"
    assert merged["email"] == "sam@np.example"
    assert from_rec is True


def test_no_profile_uses_latest_rec():
    merged, from_rec = merge_contact(
        None,
        {"name": " Ana Costa ", "agency": "AC Rep", "email": "ana@ac.example", "phone": None},
        USER,
    )
    assert merged == {"name": "Ana Costa", "agency": "AC Rep", "email": "ana@ac.example", "phone": None}
    assert from_rec is True


def test_no_name_anywhere_uses_user_name():
    merged, _ = merge_contact(None, {"name": "", "agency": None, "email": None, "phone": None}, USER)
    assert merged["name"] == "Sam Hartley"
    merged, _ = merge_contact(None, {"name": None, "agency": None, "email": None, "phone": None},
                              {"firstname": "", "lastname": None, "username": "samh"})
    assert merged["name"] == "samh"


def test_all_blank_is_not_flagged_as_from_rec():
    merged, from_rec = merge_contact(
        {"name": "Sam Hartley", "agency": "NP", "email": "s@np.example", "phone": None},
        {"name": None, "agency": None, "email": None, "phone": ""},
        USER,
    )
    assert merged["phone"] is None
    assert from_rec is False


def _as_role(role):
    main.app.dependency_overrides[main.get_current_user] = lambda: SimpleNamespace(
        id=1, role=role, username="u", email="e", firstname="", lastname=""
    )


@pytest.fixture
def call():
    cursor = MagicMock()
    connection = MagicMock()
    connection.cursor.return_value = cursor

    def request(path, role=main.ROLE_ADMIN):
        _as_role(role)
        with patch.object(main, "validate_recommendation_schema_ready"), \
             patch.object(main, "get_snowflake_connection", return_value=connection):
            return TestClient(main.app).get(path), cursor

    request.cursor = cursor
    yield request
    main.app.dependency_overrides.clear()


LIST_ROW = (
    7, 7, "Sam Hartley", "Northpoint", "sam@np.example", None,   # uid + profile
    "Sam H", "Old", "old@x.example", "+44 9",                    # latest rec
    "Sam", "Hartley", "samh",                                     # user
    22, datetime(2026, 11, 25, 10, 0),                            # count, last
)


def test_list_endpoint_shapes_rows(call):
    call.cursor.fetchall.return_value = [LIST_ROW]
    response, _ = call("/internal/agent-contacts")
    assert response.status_code == 200
    assert response.json() == [{
        "agent_user_id": 7,
        "name": "Sam Hartley",
        "agency": "Northpoint",
        "email": "sam@np.example",
        "phone": "+44 9",
        "rec_count": 22,
        "last_rec_at": "2026-11-25T10:00:00",
        "details_from_latest_rec": True,
    }]


def test_list_without_profile_row_uses_latest_rec(call):
    row = (9, None, None, None, None, None, "Ana Costa", "AC Rep", "ana@ac.example", None, "A", "C", "ac", 3,
           datetime(2026, 6, 8))
    call.cursor.fetchall.return_value = [row]
    body = call("/internal/agent-contacts")[0].json()
    assert body[0]["name"] == "Ana Costa"
    assert body[0]["details_from_latest_rec"] is True


def test_list_excludes_null_submitter(call):
    call.cursor.fetchall.return_value = []
    _, cursor = call("/internal/agent-contacts")
    sql = cursor.execute.call_args.args[0]
    assert "SUBMITTED_BY_USER_ID IS NOT NULL" in sql


@pytest.mark.parametrize("role", ["manager", "loan_manager", "scout", "agent"])
def test_list_forbidden_roles(call, role):
    assert call("/internal/agent-contacts", role=role)[0].status_code == 403


@pytest.mark.parametrize("role", ["admin", "senior_manager", "intel_reviewer"])
def test_list_allowed_roles(call, role):
    call.cursor.fetchall.return_value = []
    assert call("/internal/agent-contacts", role=role)[0].status_code == 200
