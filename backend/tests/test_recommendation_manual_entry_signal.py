"""
Tests for Task 8 of the duplicate-players fix plan: a best-effort,
no-schema-change signal on internal recommendation responses that flags
"this recommendation's linked player looks like it was manually added"
(`player_manual_entry`), plus the minimal non-admin "flag for admin review"
endpoint that reuses the existing recommendation_notes_history table.

Covers:
  - serialize_recommendation_row's derivation of player_manual_entry from
    LINKED_PLAYER_DATA_SOURCE / LINKED_PLAYER_ID / the linked player's own
    TRANSFERMARKT_LINK (row indices 48 / 46 / 51 of build_recommendation_select's
    SELECT list).
  - Backward compatibility with rows shaped before this task (51 columns,
    no LINKED_PLAYER_TRANSFERMARKT_LINK) - must not raise and must default
    to not-flagged.
  - POST /internal/recommendations/{id}/flag-duplicate: inserts an
    append-only note, 404s on a missing recommendation, rolls back on error.
"""
import asyncio
import sys
import os
from datetime import datetime
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main
from fastapi import HTTPException


# Column indices, matching build_recommendation_select's SELECT list (see
# also RECOMMENDATION_ROW_WIDTH in test_agent_recommendation_edit_link.py).
ROW_WIDTH = 52
ID_IDX = 0
PLAYER_NAME_IDX = 6
STATUS_IDX = 25
LINKED_PLAYER_ID_IDX = 46
LINKED_CAFC_PLAYER_ID_IDX = 47
LINKED_PLAYER_DATA_SOURCE_IDX = 48
LINKED_UNIVERSAL_ID_IDX = 50
LINKED_PLAYER_TRANSFERMARKT_LINK_IDX = 51


def _row(
    linked_player_id=None,
    linked_player_data_source=None,
    linked_player_transfermarkt_link=None,
    width=ROW_WIDTH,
):
    row = [None] * width
    row[ID_IDX] = 1
    row[PLAYER_NAME_IDX] = "Jon Smith"
    row[STATUS_IDX] = "Submitted"
    if width > LINKED_PLAYER_ID_IDX:
        row[LINKED_PLAYER_ID_IDX] = linked_player_id
    if width > LINKED_PLAYER_DATA_SOURCE_IDX:
        row[LINKED_PLAYER_DATA_SOURCE_IDX] = linked_player_data_source
    if width > LINKED_PLAYER_TRANSFERMARKT_LINK_IDX:
        row[LINKED_PLAYER_TRANSFERMARKT_LINK_IDX] = linked_player_transfermarkt_link
    return tuple(row)


# --- serialize_recommendation_row: player_manual_entry derivation ----------


def test_flags_external_linked_player_with_no_transfermarkt_link():
    response = main.serialize_recommendation_row(
        _row(linked_player_id=42, linked_player_data_source="external", linked_player_transfermarkt_link=None)
    )
    assert response.player_manual_entry is True


def test_flags_external_linked_player_with_blank_transfermarkt_link():
    response = main.serialize_recommendation_row(
        _row(linked_player_id=42, linked_player_data_source="external", linked_player_transfermarkt_link="   ")
    )
    assert response.player_manual_entry is True


def test_does_not_flag_when_linked_player_has_transfermarkt_link():
    response = main.serialize_recommendation_row(
        _row(
            linked_player_id=42,
            linked_player_data_source="external",
            linked_player_transfermarkt_link="https://transfermarkt.com/jon-smith",
        )
    )
    assert response.player_manual_entry is False


def test_does_not_flag_internal_players():
    response = main.serialize_recommendation_row(
        _row(linked_player_id=None, linked_player_data_source="internal", linked_player_transfermarkt_link=None)
    )
    assert response.player_manual_entry is False


def test_does_not_flag_when_no_linked_player_at_all():
    # Unmatched player name - not "manually linked", just unmatched.
    response = main.serialize_recommendation_row(
        _row(linked_player_id=None, linked_player_data_source=None, linked_player_transfermarkt_link=None)
    )
    assert response.player_manual_entry is False


def test_backward_compatible_with_pre_task_8_row_shape():
    # A row shaped like build_recommendation_select produced before this
    # task (51 columns, no LINKED_PLAYER_TRANSFERMARKT_LINK) must not raise
    # an IndexError. With no way to know the linked player's own
    # TRANSFERMARKT_LINK, the missing column is treated the same as "empty"
    # (conservative: nudge a reviewer to check rather than silently hide a
    # possible duplicate) - in practice build_recommendation_select always
    # emits this column now, so this only matters for hand-built tuples.
    row = _row(linked_player_id=42, linked_player_data_source="external", width=51)
    assert len(row) == 51
    response = main.serialize_recommendation_row(row)
    assert response.player_manual_entry is True


def test_internal_response_also_carries_the_flag():
    row = _row(linked_player_id=42, linked_player_data_source="external", linked_player_transfermarkt_link=None)
    response = main.serialize_recommendation_row(row, include_internal=True)
    assert response.player_manual_entry is True


# --- POST /internal/recommendations/{id}/flag-duplicate --------------------


class _FakeUser:
    id = 7
    username = "scout_sam"
    role = "scout"


def test_flag_duplicate_inserts_note_and_commits():
    fake_cursor = MagicMock()
    fake_conn = MagicMock()
    fake_conn.cursor.return_value = fake_cursor
    existing_row = _row(linked_player_id=42, linked_player_data_source="external")
    history_stub = [{"id": 1, "note_content": "flagged"}]

    with patch.object(main, "get_snowflake_connection", return_value=fake_conn), \
         patch.object(main, "validate_recommendation_schema_ready"), \
         patch.object(main, "fetch_recommendation_detail", return_value=existing_row), \
         patch.object(main, "ensure_recommendation_notes_history_table"), \
         patch.object(main, "fetch_recommendation_notes_history", return_value=history_stub):
        result = asyncio.run(
            main.flag_internal_recommendation_duplicate(recommendation_id=1, current_user=_FakeUser())
        )

    assert result == history_stub
    fake_conn.commit.assert_called_once()
    insert_calls = [
        call for call in fake_cursor.execute.call_args_list
        if "INSERT INTO recommendation_notes_history" in call.args[0]
    ]
    assert len(insert_calls) == 1
    params = insert_calls[0].args[1]
    assert params[0] == 1  # recommendation_id
    assert "scout_sam" in params[1]  # note text mentions the flagging user
    assert params[2] == 7  # created_by = current_user.id
    assert isinstance(params[3], datetime)


def test_flag_duplicate_404s_when_recommendation_missing():
    fake_cursor = MagicMock()
    fake_conn = MagicMock()
    fake_conn.cursor.return_value = fake_cursor

    with patch.object(main, "get_snowflake_connection", return_value=fake_conn), \
         patch.object(main, "validate_recommendation_schema_ready"), \
         patch.object(main, "fetch_recommendation_detail", return_value=None):
        try:
            asyncio.run(
                main.flag_internal_recommendation_duplicate(recommendation_id=999, current_user=_FakeUser())
            )
            assert False, "expected HTTPException"
        except HTTPException as exc:
            assert exc.status_code == 404

    fake_conn.commit.assert_not_called()


def test_flag_duplicate_rolls_back_on_error():
    fake_cursor = MagicMock()
    fake_cursor.execute.side_effect = Exception("boom")
    fake_conn = MagicMock()
    fake_conn.cursor.return_value = fake_cursor
    existing_row = _row(linked_player_id=42, linked_player_data_source="external")

    with patch.object(main, "get_snowflake_connection", return_value=fake_conn), \
         patch.object(main, "validate_recommendation_schema_ready"), \
         patch.object(main, "fetch_recommendation_detail", return_value=existing_row), \
         patch.object(main, "ensure_recommendation_notes_history_table"):
        try:
            asyncio.run(
                main.flag_internal_recommendation_duplicate(recommendation_id=1, current_user=_FakeUser())
            )
            assert False, "expected HTTPException"
        except HTTPException as exc:
            assert exc.status_code == 500

    fake_conn.rollback.assert_called_once()
    fake_conn.commit.assert_not_called()
