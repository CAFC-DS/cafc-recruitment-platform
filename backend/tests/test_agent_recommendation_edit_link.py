"""
Tests for Task 1 of the duplicate-players fix plan: editing a manual-entry
agent recommendation must not silently mint a new PLAYERS row when only
unrelated fields changed.

These tests exercise `should_reuse_existing_agent_intake_link` (the pure
decision function extracted in `update_agent_recommendation`) directly,
plus the endpoint end-to-end against a mocked Snowflake cursor/connection to
confirm `resolve_agent_intake_player_link` (and therefore
`_create_external_player_from_agent_intake`) is skipped when name/DOB are
unchanged, and still runs when they change.
"""
import sys
import os
from datetime import date, datetime
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main


# --- Unit tests for the pure decision helper -------------------------------


def _player_row(name="Jon Smith", dob=date(2000, 1, 1)):
    # Matches the SELECT order in find_player_by_universal_or_legacy_id:
    # PLAYERID, CAFC_PLAYER_ID, PLAYERNAME, FIRSTNAME, LASTNAME, BIRTHDATE, ...
    return (1, None, name, "Jon", "Smith", dob, "Charlton", "CB", "external")


def test_reuses_link_when_manual_entry_name_and_dob_unchanged():
    assert main.should_reuse_existing_agent_intake_link(
        player_manual_entry=True,
        existing_linked_universal_id="external_1",
        existing_player_data=_player_row(),
        new_player_name="Jon Smith",
        new_player_dob=date(2000, 1, 1),
    ) is True


def test_reuses_link_with_trimmed_and_case_insensitive_name_match():
    assert main.should_reuse_existing_agent_intake_link(
        player_manual_entry=True,
        existing_linked_universal_id="external_1",
        existing_player_data=_player_row(name="Jon Smith"),
        new_player_name="  jon smith  ",
        new_player_dob=date(2000, 1, 1),
    ) is True


def test_does_not_reuse_when_name_changed():
    assert main.should_reuse_existing_agent_intake_link(
        player_manual_entry=True,
        existing_linked_universal_id="external_1",
        existing_player_data=_player_row(name="Jon Smith"),
        new_player_name="Jonathan Smith",
        new_player_dob=date(2000, 1, 1),
    ) is False


def test_does_not_reuse_when_dob_changed():
    assert main.should_reuse_existing_agent_intake_link(
        player_manual_entry=True,
        existing_linked_universal_id="external_1",
        existing_player_data=_player_row(dob=date(2000, 1, 1)),
        new_player_name="Jon Smith",
        new_player_dob=date(2001, 1, 1),
    ) is False


def test_does_not_reuse_when_not_manual_entry():
    # Path A (typeahead pick) always goes through resolve_agent_intake_player_link.
    assert main.should_reuse_existing_agent_intake_link(
        player_manual_entry=False,
        existing_linked_universal_id="external_1",
        existing_player_data=_player_row(),
        new_player_name="Jon Smith",
        new_player_dob=date(2000, 1, 1),
    ) is False


def test_does_not_reuse_when_no_existing_link():
    assert main.should_reuse_existing_agent_intake_link(
        player_manual_entry=True,
        existing_linked_universal_id=None,
        existing_player_data=None,
        new_player_name="Jon Smith",
        new_player_dob=date(2000, 1, 1),
    ) is False


def test_does_not_reuse_when_linked_player_no_longer_resolves():
    # e.g. the previously-linked PLAYERS row was deleted/merged away.
    assert main.should_reuse_existing_agent_intake_link(
        player_manual_entry=True,
        existing_linked_universal_id="external_1",
        existing_player_data=None,
        new_player_name="Jon Smith",
        new_player_dob=date(2000, 1, 1),
    ) is False


def test_dob_none_on_both_sides_counts_as_unchanged():
    assert main.should_reuse_existing_agent_intake_link(
        player_manual_entry=True,
        existing_linked_universal_id="external_1",
        existing_player_data=_player_row(dob=None),
        new_player_name="Jon Smith",
        new_player_dob=None,
    ) is True


def test_dob_none_vs_present_is_a_change():
    assert main.should_reuse_existing_agent_intake_link(
        player_manual_entry=True,
        existing_linked_universal_id="external_1",
        existing_player_data=_player_row(dob=date(2000, 1, 1)),
        new_player_name="Jon Smith",
        new_player_dob=None,
    ) is False


def test_name_matches_across_accents():
    assert main._agent_intake_name_matches("José García", "Jose Garcia") is True


def test_dob_matches_date_vs_isoformat_string():
    assert main._agent_intake_dob_matches(date(2000, 1, 1), "2000-01-01") is True


def test_dob_matches_date_vs_datetime_at_midnight():
    # Snowflake may hand back BIRTHDATE as a datetime rather than a bare
    # date; without normalizing to date-only this would false-negative and
    # silently defeat the whole fix (resolve would run on every edit).
    assert main._agent_intake_dob_matches(date(2000, 1, 1), datetime(2000, 1, 1, 0, 0)) is True


def test_dob_matches_datetime_string_form():
    assert main._agent_intake_dob_matches(date(2000, 1, 1), "2000-01-01 00:00:00") is True


def test_reuses_link_when_existing_player_dob_is_a_datetime():
    assert main.should_reuse_existing_agent_intake_link(
        player_manual_entry=True,
        existing_linked_universal_id="external_1",
        existing_player_data=_player_row(dob=datetime(2000, 1, 1, 0, 0)),
        new_player_name="Jon Smith",
        new_player_dob=date(2000, 1, 1),
    ) is True


# --- Endpoint-level integration tests --------------------------------------
#
# These call the real `update_agent_recommendation` coroutine (not through
# HTTP/TestClient) with `prepare_agent_recommendation_payload` and
# `fetch_recommendation_detail` stubbed (they have their own validation/SQL
# concerns outside this task's scope), but exercise the actual
# should_reuse_existing_agent_intake_link wiring, the real
# find_player_by_universal_or_legacy_id call, and confirm whether
# resolve_agent_intake_player_link (and therefore _create_external_player_
# from_agent_intake's INSERT INTO players) actually runs.

RECOMMENDATION_ROW_WIDTH = 51  # matches build_recommendation_select's column count
ID_IDX = 0
PLAYER_NAME_IDX = 6
SUBMITTED_BY_USER_ID_IDX = 24
STATUS_IDX = 25
LINKED_UNIVERSAL_ID_IDX = 50


def _recommendation_row(submitted_by_user_id=1, status="Submitted", linked_universal_id="external_42"):
    row = [None] * RECOMMENDATION_ROW_WIDTH
    row[ID_IDX] = 1
    row[PLAYER_NAME_IDX] = "Jon Smith"
    row[SUBMITTED_BY_USER_ID_IDX] = submitted_by_user_id
    row[STATUS_IDX] = status
    row[LINKED_UNIVERSAL_ID_IDX] = linked_universal_id
    return tuple(row)


def _payload_stub(player_name="Jon Smith", player_dob=date(2000, 1, 1)):
    return {
        "AGENT_NAME": "Agent Smith",
        "AGENCY": None,
        "AGENT_EMAIL": "agent@example.com",
        "AGENT_NUMBER": None,
        "DATE": date(2026, 1, 1),
        "PLAYER_NAME": player_name,
        "TRANSFERMARKT_LINK": "https://transfermarkt.com/jon-smith",
        "AGREEMENT_TYPE": "Free Transfer",
        "CONTRACT_EXPIRY": date(2027, 1, 1),
        "CONTRACT_OPTIONS": "None",
        "POTENTIAL_DEAL_TYPE": "Permanent Transfer",
        "TRANSFER_FEE": None,
        "CURRENT_WAGES": None,
        "EXPECTED_WAGES": 1000,
        "ADDITIONAL_INFO": None,
        "TRANSFER_FEE_AMOUNT": None,
        "TRANSFER_FEE_CURRENCY": None,
        "TRANSFER_FEE_MIN": None,
        "TRANSFER_FEE_MAX": None,
        "CURRENT_WAGES_AMOUNT": None,
        "CURRENT_WAGES_MIN": None,
        "CURRENT_WAGES_MAX": None,
        "CURRENT_WAGES_CURRENCY": None,
        "EXPECTED_WAGES_AMOUNT": 1000,
        "EXPECTED_WAGES_MIN": 1000,
        "EXPECTED_WAGES_MAX": 1000,
        "EXPECTED_WAGES_CURRENCY": "GBP",
        "WAGE_BASIS": "Gross",
        "RECOMMENDED_POSITION": "CB",
        "PLAYER_DATE_OF_BIRTH": player_dob,
        "PLAYER_MANUAL_SQUAD": None,
    }


class _FakeUser:
    id = 1
    email = "agent@example.com"


# Realistic subset of player_recommendations columns so update_values
# actually includes LINKED_UNIVERSAL_ID, matching production schema.
RECOMMENDATION_COLUMNS = [
    "AGENT_NAME", "AGENCY", "AGENT_EMAIL", "AGENT_NUMBER", "DATE",
    "PLAYER_NAME", "TRANSFERMARKT_LINK", "AGREEMENT_TYPE", "CONTRACT_EXPIRY",
    "CONTRACT_OPTIONS", "POTENTIAL_DEAL_TYPE", "TRANSFER_FEE",
    "CURRENT_WAGES", "EXPECTED_WAGES", "ADDITIONAL_INFO", "UPDATED_AT",
    "TRANSFER_FEE_AMOUNT", "TRANSFER_FEE_CURRENCY", "TRANSFER_FEE_MIN",
    "TRANSFER_FEE_MAX", "CURRENT_WAGES_AMOUNT", "CURRENT_WAGES_MIN",
    "CURRENT_WAGES_MAX", "CURRENT_WAGES_CURRENCY", "EXPECTED_WAGES_AMOUNT",
    "EXPECTED_WAGES_MIN", "EXPECTED_WAGES_MAX", "EXPECTED_WAGES_CURRENCY",
    "WAGE_BASIS", "RECOMMENDED_POSITION", "PLAYER_DATE_OF_BIRTH",
    "LINKED_UNIVERSAL_ID",
]


async def _call_update_endpoint(
    *, player_name, player_dob_str, player_manual_entry, linked_universal_id,
    payload_dob=date(2000, 1, 1),
):
    fake_cursor = MagicMock()
    fake_conn = MagicMock()
    fake_conn.cursor.return_value = fake_cursor

    with patch.object(main, "get_snowflake_connection", return_value=fake_conn), \
         patch.object(main, "validate_recommendation_schema_ready"), \
         patch.object(main, "get_table_columns", return_value=RECOMMENDATION_COLUMNS), \
         patch.object(
             main, "fetch_recommendation_detail", return_value=_recommendation_row()
         ), \
         patch.object(
             main,
             "prepare_agent_recommendation_payload",
             return_value=_payload_stub(player_name=player_name, player_dob=payload_dob),
         ), \
         patch.object(
             main,
             "find_player_by_universal_or_legacy_id",
             return_value=(_player_row(name="Jon Smith", dob=date(2000, 1, 1)), "external"),
         ) as mock_find_player, \
         patch.object(
             main, "resolve_agent_intake_player_link", return_value="external_999"
         ) as mock_resolve, \
         patch.object(main, "serialize_recommendation_row", return_value={"id": 1}):

        result = await main.update_agent_recommendation(
            recommendation_id=1,
            agent_name="Agent Smith",
            agency=None,
            agent_email="agent@example.com",
            agent_number=None,
            submission_date="2026-01-01",
            player_name=player_name,
            player_date_of_birth=player_dob_str,
            recommended_position="CB",
            transfermarkt_link="https://transfermarkt.com/jon-smith",
            agreement_type="Free Transfer",
            confirmed_contract_expiry="2027-01-01",
            contract_options="None",
            potential_deal_type="Permanent Transfer",
            transfer_fee=None,
            transfer_fee_currency=None,
            current_wages_per_week=None,
            current_wages_currency=None,
            wage_basis=None,
            current_wages_basis=None,
            expected_wages_per_week="1000",
            expected_wages_currency="GBP",
            expected_wages_basis="Gross",
            additional_information=None,
            linked_universal_id=linked_universal_id,
            player_manual_entry=player_manual_entry,
            supporting_file=None,
            current_user=_FakeUser(),
        )
    return result, mock_resolve, mock_find_player, fake_cursor


def test_endpoint_skips_resolve_and_reuses_link_when_manual_entry_unchanged():
    import asyncio

    _, mock_resolve, mock_find_player, fake_cursor = asyncio.run(
        _call_update_endpoint(
            player_name="Jon Smith",
            player_dob_str="2000-01-01",
            player_manual_entry=True,
            # Frontend clears linked_universal_id whenever manual entry is checked.
            linked_universal_id=None,
        )
    )

    # The whole point of this task: resolve_agent_intake_player_link (and
    # therefore _create_external_player_from_agent_intake's INSERT INTO
    # players) must not run when name/DOB are unchanged.
    mock_resolve.assert_not_called()
    mock_find_player.assert_called_once_with("external_42", fake_cursor)

    # The UPDATE statement must persist the pre-existing link (row[50] before
    # the edit), not a new one that resolve_agent_intake_player_link would
    # have produced.
    update_calls = [
        call for call in fake_cursor.execute.call_args_list
        if "UPDATE player_recommendations" in call.args[0]
    ]
    assert len(update_calls) == 1
    sql, params = update_calls[0].args
    assert "LINKED_UNIVERSAL_ID" in sql
    assert "external_42" in params
    assert "external_999" not in params  # resolve()'s mocked return must never land


def test_endpoint_still_resolves_when_manual_entry_name_changed():
    import asyncio

    _, mock_resolve, mock_find_player, fake_cursor = asyncio.run(
        _call_update_endpoint(
            player_name="Someone Else",
            player_dob_str="2000-01-01",
            player_manual_entry=True,
            linked_universal_id=None,
        )
    )

    mock_resolve.assert_called_once()

    update_calls = [
        call for call in fake_cursor.execute.call_args_list
        if "UPDATE player_recommendations" in call.args[0]
    ]
    assert len(update_calls) == 1
    sql, params = update_calls[0].args
    assert "external_999" in params  # resolve()'s new link is actually persisted


def test_endpoint_still_resolves_when_manual_entry_dob_changed():
    import asyncio

    _, mock_resolve, mock_find_player, fake_cursor = asyncio.run(
        _call_update_endpoint(
            player_name="Jon Smith",
            player_dob_str="2005-06-15",
            player_manual_entry=True,
            linked_universal_id=None,
            payload_dob=date(2005, 6, 15),  # differs from the linked player's 2000-01-01
        )
    )

    mock_resolve.assert_called_once()


def test_endpoint_resolves_as_before_when_not_manual_entry():
    """Path A (typeahead pick, player_manual_entry=False) must keep calling
    resolve_agent_intake_player_link exactly as it did before this fix."""
    import asyncio

    _, mock_resolve, mock_find_player, fake_cursor = asyncio.run(
        _call_update_endpoint(
            player_name="Jon Smith",
            player_dob_str="2000-01-01",
            player_manual_entry=False,
            linked_universal_id="external_42",
        )
    )

    mock_resolve.assert_called_once()
    mock_find_player.assert_not_called()
