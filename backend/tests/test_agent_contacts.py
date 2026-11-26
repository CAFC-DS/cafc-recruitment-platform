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
from agent_contacts import merge_contact, summarise_scores

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
             patch.object(main, "get_snowflake_connection", return_value=connection), \
             patch.object(main, "build_recommendation_select", return_value="SELECT 1"), \
             patch.object(main.data_scores, "list_score", side_effect=request.data_score):
            return TestClient(main.app).get(path), cursor

    request.cursor = cursor
    request.data_score = lambda pid: {"kind": "career", "value": {501: 110.0, 502: 100.0}.get(pid), "band": 4,
                                      "band_name": "Strong starter", "position": "CB", "season": "25/26",
                                      "seasons": 3, "min": 3000} if pid in (501, 502) else None
    yield request
    main.app.dependency_overrides.clear()


LIST_ROW = (
    7, 7, "Sam Hartley", "Northpoint", "sam@np.example", None,   # uid + profile
    "Sam H", "Old", "old@x.example", "+44 9",                    # latest rec
    "Sam", "Hartley", "samh",                                     # user
    22, datetime(2026, 11, 25, 10, 0),                            # count, last
)


def test_list_endpoint_shapes_rows(call):
    call.cursor.fetchall.side_effect = [[LIST_ROW], []]
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
        "avg_performance_score": None,
        "performance_scored_count": 0,
        "avg_data_score": None,
        "data_scored_count": 0,
    }]


def test_list_without_profile_row_uses_latest_rec(call):
    row = (9, None, None, None, None, None, "Ana Costa", "AC Rep", "ana@ac.example", None, "A", "C", "ac", 3,
           datetime(2026, 6, 8))
    call.cursor.fetchall.side_effect = [[row], []]
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


def _rec(i, perf=None, player_id=None, source=None):
    return (100 + i, f"Player {i}", "CB", datetime(2004, 1, 1).date(), datetime(2026, 11, 25 - i, 9, 0), "Submitted",
            perf, player_id, source)


def _limit_query(cursor):
    return next(c for c in cursor.execute.call_args_list if "LIMIT" in c.args[0])


def test_recent_recs_newest_first_and_limited(call):
    call.cursor.fetchone.return_value = (22,)
    call.cursor.fetchall.return_value = [_rec(i) for i in range(5)]
    response, cursor = call("/internal/agent-contacts/7/recommendations")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 22
    assert len(body["items"]) == 5
    assert body["items"][0] == {
        "id": 100, "player_name": "Player 0", "recommended_position": "CB",
        "player_date_of_birth": "2004-01-01", "submitted_at": "2026-11-25T09:00:00", "status": "Submitted",
        "avg_performance_score": None, "data_score": None,
    }
    sql, params = _limit_query(cursor).args
    assert "SUBMITTED_BY_USER_ID = %s" in sql
    assert "ORDER BY rec.CREATED_AT DESC, rec.ID DESC" in sql
    assert tuple(params) == (7, 5)


@pytest.mark.parametrize("asked, used", [("500", 20), ("0", 1), ("3", 3)])
def test_recent_recs_limit_clamped(call, asked, used):
    call.cursor.fetchone.return_value = (0,)
    call.cursor.fetchall.return_value = []
    _, cursor = call(f"/internal/agent-contacts/7/recommendations?limit={asked}")
    assert tuple(_limit_query(cursor).args[1])[-1] == used


def test_recent_recs_unknown_agent_is_empty(call):
    call.cursor.fetchone.return_value = (0,)
    call.cursor.fetchall.return_value = []
    response, _ = call("/internal/agent-contacts/999/recommendations")
    assert response.status_code == 200
    assert response.json() == {"total": 0, "items": []}


@pytest.mark.parametrize("role", ["manager", "loan_manager", "scout", "agent"])
def test_recent_recs_forbidden_roles(call, role):
    assert call("/internal/agent-contacts/7/recommendations", role=role)[0].status_code == 403


# --- scores -------------------------------------------------------------------------------------

def _lookup(pid):
    return {501: 110.0, 502: 100.0}.get(pid)


def test_summarise_counts_each_player_once():
    rows = [
        (7, "ext:501", 7.0, 501),
        (7, "ext:501", 7.0, 501),   # same player recommended again
        (7, "ext:502", 5.0, 502),
    ]
    result = summarise_scores(rows, _lookup, include_perf=True)
    assert result[7] == {"avg_performance_score": 6.0, "performance_scored_count": 2,
                         "avg_data_score": 105.0, "data_scored_count": 2}


def test_summarise_partial_scores_count_only_towards_what_they_have():
    rows = [
        (7, "ext:501", None, 501),        # data only
        (7, "cafc:9", 8.0, None),         # performance only
        (7, "name:joe bloggs", None, None),  # neither
    ]
    result = summarise_scores(rows, _lookup, include_perf=True)
    assert result[7] == {"avg_performance_score": 8.0, "performance_scored_count": 1,
                         "avg_data_score": 110.0, "data_scored_count": 1}


def test_summarise_hidden_scores_are_none():
    rows = [(7, "ext:501", 7.0, 501)]
    result = summarise_scores(rows, None, include_perf=False)
    assert result[7] == {"avg_performance_score": None, "performance_scored_count": 0,
                         "avg_data_score": None, "data_scored_count": 0}


def test_summarise_rounds_performance_to_two_places():
    rows = [(7, "a", 7.0, None), (7, "b", 6.0, None), (7, "c", 6.0, None)]
    assert summarise_scores(rows, None, include_perf=True)[7]["avg_performance_score"] == 6.33


SCORE_ROWS = [
    # submitter, universal id, cafc id, player id, player name, avg perf, data source
    (7, None, None, 501, "Kofi Mensah", 7.0, "external"),
    (7, None, None, 501, "Kofi Mensah", 7.0, "external"),
    (7, "internal_9", 9, None, "Finn Walsh", 5.0, "internal"),
]


def test_list_attaches_agent_averages_for_admin(call):
    call.cursor.fetchall.side_effect = [[LIST_ROW], SCORE_ROWS]
    body = call("/internal/agent-contacts")[0].json()[0]
    assert body["avg_performance_score"] == 6.0
    assert body["performance_scored_count"] == 2
    assert body["avg_data_score"] == 110.0
    assert body["data_scored_count"] == 1
    sql = call.cursor.execute.call_args_list[-1].args[0]
    assert "AVG_PERFORMANCE_SCORE" in sql and "SUBMITTED_BY_USER_ID IS NOT NULL" in sql


def test_list_hides_scores_from_intel_reviewer(call):
    call.cursor.fetchall.side_effect = [[LIST_ROW], SCORE_ROWS]
    body = call("/internal/agent-contacts", role="intel_reviewer")[0].json()[0]
    assert body["avg_performance_score"] is None
    assert body["avg_data_score"] is None


def test_recent_recs_carry_player_scores_for_admin(call):
    call.cursor.fetchone.return_value = (2,)
    call.cursor.fetchall.return_value = [_rec(0, 6.5, 501, "external"), _rec(1, None, 77, "internal")]
    items = call("/internal/agent-contacts/7/recommendations")[0].json()["items"]
    assert items[0]["avg_performance_score"] == 6.5
    assert items[0]["data_score"]["value"] == 110.0
    assert items[1]["avg_performance_score"] is None
    assert items[1]["data_score"] is None   # only external players have data scores


def test_recent_recs_hide_scores_from_intel_reviewer(call):
    call.cursor.fetchone.return_value = (1,)
    call.cursor.fetchall.return_value = [_rec(0, 6.5, 501, "external")]
    item = call("/internal/agent-contacts/7/recommendations", role="intel_reviewer")[0].json()["items"][0]
    assert item["avg_performance_score"] is None
    assert item["data_score"] is None


def test_player_key_matches_linked_and_name_matched_recs():
    linked = main.agent_contact_player_key("external_123", None, 123, "Kofi Mensah", "external")
    legacy = main.agent_contact_player_key(None, None, 123, "Kofi Mensah", "external")
    assert linked == legacy
    linked_internal = main.agent_contact_player_key("internal_45", 45, None, "Finn Walsh", "internal")
    legacy_internal = main.agent_contact_player_key(None, 45, 9, "Finn Walsh", "internal")
    assert linked_internal == legacy_internal
    assert main.agent_contact_player_key("external_5", None, None, "X", None) == main.agent_contact_player_key(None, None, 5, "X", "external")


def test_summarise_takes_first_available_score_for_a_duplicated_player():
    rows = [(7, "ext:501", None, None), (7, "ext:501", 6.0, 501)]
    result = summarise_scores(rows, _lookup, include_perf=True)[7]
    assert result["avg_performance_score"] == 6.0
    assert result["avg_data_score"] == 110.0


def test_list_still_loads_when_the_score_query_fails(call):
    call.cursor.fetchall.side_effect = [[LIST_ROW]]
    call.cursor.execute.side_effect = [None, RuntimeError("snowflake hiccup")]
    response, _ = call("/internal/agent-contacts")
    assert response.status_code == 200
    assert response.json()[0]["name"] == "Sam Hartley"
    assert response.json()[0]["avg_performance_score"] is None
