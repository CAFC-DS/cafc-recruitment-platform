"""
Tests for Task 8 of the duplicate-players fix plan: a best-effort,
no-schema-change signal on internal recommendation responses that flags
"this recommendation's linked player looks like it was manually added"
(`player_manual_entry`), plus the minimal non-admin "flag for admin review"
endpoint that reuses the existing recommendation_notes_history table.

Covers:
  - serialize_recommendation_row's derivation of player_manual_entry from
    LINKED_PLAYER_DATA_SOURCE / LINKED_PLAYER_ID / the linked player's own
    TRANSFERMARKT_LINK vs. the recommendation's own TRANSFERMARKT_LINK (row
    indices 48 / 46 / 51 / 7 of build_recommendation_select's SELECT list).
    Agent intake (_create_external_player_from_agent_intake) copies the
    recommendation's typed TM link verbatim onto the newly-created player,
    so an intake-created player's link equals the recommendation's link by
    construction - "blank link = manual" was checked previously, but every
    agent submission requires a non-blank TM link
    (frontend/src/utils/agentRecommendationForm.ts), so that signal could
    never fire in production. The fixtures below reflect the corrected
    equality-based derivation.
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
RECOMMENDATION_TRANSFERMARKT_LINK_IDX = 7
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
    recommendation_transfermarkt_link=None,
    width=ROW_WIDTH,
):
    row = [None] * width
    row[ID_IDX] = 1
    row[PLAYER_NAME_IDX] = "Jon Smith"
    if width > RECOMMENDATION_TRANSFERMARKT_LINK_IDX:
        row[RECOMMENDATION_TRANSFERMARKT_LINK_IDX] = recommendation_transfermarkt_link
    row[STATUS_IDX] = "Submitted"
    if width > LINKED_PLAYER_ID_IDX:
        row[LINKED_PLAYER_ID_IDX] = linked_player_id
    if width > LINKED_PLAYER_DATA_SOURCE_IDX:
        row[LINKED_PLAYER_DATA_SOURCE_IDX] = linked_player_data_source
    if width > LINKED_PLAYER_TRANSFERMARKT_LINK_IDX:
        row[LINKED_PLAYER_TRANSFERMARKT_LINK_IDX] = linked_player_transfermarkt_link
    return tuple(row)


# --- serialize_recommendation_row: player_manual_entry derivation ----------


def test_flags_when_linked_player_tm_link_equals_recommendation_tm_link():
    # This is the agent-intake case Task 8 exists to catch:
    # _create_external_player_from_agent_intake copies the recommendation's
    # typed TM link verbatim onto the newly-created player, so the two
    # values match by construction.
    response = main.serialize_recommendation_row(
        _row(
            linked_player_id=42,
            linked_player_data_source="external",
            linked_player_transfermarkt_link="https://transfermarkt.com/jon-smith",
            recommendation_transfermarkt_link="https://transfermarkt.com/jon-smith",
        )
    )
    assert response.player_manual_entry is True


def test_does_not_flag_when_linked_player_tm_link_differs_from_recommendation():
    # A genuinely-synced provider player: its own TM link differs from
    # whatever the agent typed on this recommendation (the common case for
    # a normally-searched/linked external player).
    response = main.serialize_recommendation_row(
        _row(
            linked_player_id=42,
            linked_player_data_source="external",
            linked_player_transfermarkt_link="https://transfermarkt.com/canonical-jon-smith",
            recommendation_transfermarkt_link="https://transfermarkt.com/jon-smith",
        )
    )
    assert response.player_manual_entry is False


def test_does_not_flag_when_both_transfermarkt_links_are_blank():
    # Blank-on-both-sides must NOT be treated as a match (mirrors
    # duplicate_detection.score_player_match's transfermarkt_match
    # convention) - otherwise every unmatched/legacy row with no TM link on
    # either side would be flagged.
    response = main.serialize_recommendation_row(
        _row(
            linked_player_id=42,
            linked_player_data_source="external",
            linked_player_transfermarkt_link="   ",
            recommendation_transfermarkt_link=None,
        )
    )
    assert response.player_manual_entry is False


def test_does_not_flag_internal_players():
    response = main.serialize_recommendation_row(
        _row(
            linked_player_id=None,
            linked_player_data_source="internal",
            linked_player_transfermarkt_link=None,
            recommendation_transfermarkt_link="https://transfermarkt.com/jon-smith",
        )
    )
    assert response.player_manual_entry is False


def test_does_not_flag_when_no_linked_player_at_all():
    # Unmatched player name - not "manually linked", just unmatched.
    response = main.serialize_recommendation_row(
        _row(
            linked_player_id=None,
            linked_player_data_source=None,
            linked_player_transfermarkt_link=None,
            recommendation_transfermarkt_link=None,
        )
    )
    assert response.player_manual_entry is False


def test_backward_compatible_with_pre_task_8_row_shape():
    # A row shaped like build_recommendation_select produced before this
    # task (51 columns, no LINKED_PLAYER_TRANSFERMARKT_LINK) must not raise
    # an IndexError, and MUST fail closed: with no way to know the linked
    # player's own TRANSFERMARKT_LINK, we must never treat "can't tell" the
    # same as "genuinely matches" - that would flag every external-linked
    # recommendation as manually created, including normally-searched ones,
    # which directly violates "never flag a normally-linked player." In
    # practice build_recommendation_select always emits this column now
    # (with its own fail-closed '__signal_unavailable__' sentinel when the
    # guard columns are missing from the schema - see
    # test_signal_unavailable_sentinel_is_not_flagged below), so this only
    # matters for hand-built/legacy-shaped tuples.
    row = _row(linked_player_id=42, linked_player_data_source="external", width=51)
    assert len(row) == 51
    response = main.serialize_recommendation_row(row)
    assert response.player_manual_entry is False


def test_signal_unavailable_sentinel_is_not_flagged():
    # Mirrors what build_recommendation_select emits when the guard columns
    # (players.TRANSFERMARKT_LINK / players.PLAYERID) don't exist in this
    # environment's schema: a non-blank sentinel string, not NULL, so the
    # equality-based flagging logic can't misfire on it (even if it happened
    # to equal the recommendation's own TM link, which it never would).
    response = main.serialize_recommendation_row(
        _row(
            linked_player_id=42,
            linked_player_data_source="external",
            linked_player_transfermarkt_link="__signal_unavailable__",
            recommendation_transfermarkt_link="__signal_unavailable__",
        )
    )
    assert response.player_manual_entry is False


def test_internal_response_also_carries_the_flag():
    row = _row(
        linked_player_id=42,
        linked_player_data_source="external",
        linked_player_transfermarkt_link="https://transfermarkt.com/jon-smith",
        recommendation_transfermarkt_link="https://transfermarkt.com/jon-smith",
    )
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
