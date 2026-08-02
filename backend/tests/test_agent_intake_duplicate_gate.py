"""
Tests for Task 3 of the duplicate-players fix plan: a server-side gate that
stops agent-portal manual player entry from silently creating duplicate
PLAYERS rows.

Covers:
  - _find_agent_intake_duplicate_candidates (SQL shape, scoring, dedupe,
    sort order, cap at 5).
  - resolve_agent_intake_player_link's 409 gate and confirm_new_player bypass.
  - create_agent_recommendation / update_agent_recommendation wiring:
    confirm_new_player threaded through, 409 propagates with a clean
    rollback and no INSERT INTO players.
"""
import asyncio
import sys
import os
from datetime import date, datetime
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main
from fastapi import HTTPException


# --- _find_agent_intake_duplicate_candidates --------------------------------


def _candidate_row(
    player_id=1,
    cafc_id=None,
    name="Jon Smith",
    birthdate=date(2000, 1, 1),
    position="CB",
    data_source="external",
    transfermarkt_link=None,
    squad_name="Charlton",
):
    # Matches candidate_columns order: PLAYERID, CAFC_PLAYER_ID, PLAYERNAME,
    # BIRTHDATE, POSITION, DATA_SOURCE, TRANSFERMARKT_LINK, SQUADNAME
    return (player_id, cafc_id, name, birthdate, position, data_source, transfermarkt_link, squad_name)


def _cursor_with_ilike_results(rows):
    """A fake cursor whose first execute() (the ILIKE pass) returns `rows`
    and whose second execute() (the JAROWINKLER fallback) returns nothing."""
    cursor = MagicMock()
    cursor.fetchall.side_effect = [rows, []]
    return cursor


def test_returns_empty_when_player_name_blank():
    cursor = MagicMock()
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]):
        result = main._find_agent_intake_duplicate_candidates(cursor, "   ", None)
    assert result == []
    cursor.execute.assert_not_called()


def test_returns_empty_when_players_table_missing_playername_column():
    cursor = MagicMock()
    with patch.object(main, "get_table_columns", return_value=["PLAYERID"]):
        result = main._find_agent_intake_duplicate_candidates(cursor, "Jon Smith", date(2000, 1, 1))
    assert result == []
    cursor.execute.assert_not_called()


def test_high_confidence_exact_name_and_dob_match():
    rows = [_candidate_row(player_id=42, name="Jon Smith", birthdate=date(2000, 1, 1))]
    cursor = _cursor_with_ilike_results(rows)
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        result = main._find_agent_intake_duplicate_candidates(cursor, "Jon Smith", date(2000, 1, 1))
    assert len(result) == 1
    candidate = result[0]
    assert candidate["confidence"] == "high"
    assert candidate["universal_id"] == "external_42"
    assert candidate["player_name"] == "Jon Smith"
    assert candidate["date_of_birth"] == "2000-01-01"
    assert candidate["squad_name"] == "Charlton"
    assert candidate["position"] == "CB"


def test_low_confidence_candidates_are_excluded():
    # Fuzzy name well below the medium threshold and no DOB match: no tier.
    rows = [_candidate_row(name="Totally Different Guy", birthdate=date(1990, 5, 5))]
    cursor = _cursor_with_ilike_results(rows)
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        result = main._find_agent_intake_duplicate_candidates(cursor, "Jon Smith", date(2000, 1, 1))
    assert result == []


def test_medium_confidence_exact_name_missing_dob():
    rows = [_candidate_row(name="Jon Smith", birthdate=None)]
    cursor = _cursor_with_ilike_results(rows)
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        result = main._find_agent_intake_duplicate_candidates(cursor, "Jon Smith", date(2000, 1, 1))
    assert len(result) == 1
    assert result[0]["confidence"] == "medium"


def test_exact_dob_match_scores_high_when_birthdate_is_a_datetime():
    # Snowflake can hand BIRTHDATE back as a datetime-at-midnight rather than
    # a bare date. Without normalizing, this would false-negative into
    # "DOB mismatch" and drop to medium (or below) instead of high.
    rows = [_candidate_row(name="Jon Smith", birthdate=datetime(2000, 1, 1, 0, 0))]
    cursor = _cursor_with_ilike_results(rows)
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        result = main._find_agent_intake_duplicate_candidates(cursor, "Jon Smith", date(2000, 1, 1))
    assert len(result) == 1
    assert result[0]["confidence"] == "high"


def test_fuzzy_name_with_exact_dob_scores_medium_when_birthdate_is_a_datetime():
    # "Jonathon Smith" vs "Jonathan Smith": one-character diff over a
    # 14-char string is ~92.9% similarity (Levenshtein), clearing the >=90%
    # fuzzy-name threshold used by score_intake_match's medium tier.
    rows = [_candidate_row(name="Jonathon Smith", birthdate=datetime(2000, 1, 1, 0, 0))]
    cursor = _cursor_with_ilike_results(rows)
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        result = main._find_agent_intake_duplicate_candidates(cursor, "Jonathan Smith", date(2000, 1, 1))
    assert len(result) == 1
    assert result[0]["confidence"] == "medium"


def test_shared_transfermarkt_link_scores_high_even_with_different_names():
    rows = [
        _candidate_row(
            name="Totally Different Name",
            birthdate=None,
            transfermarkt_link="https://transfermarkt.com/jon-smith/profile/spieler/12345",
        )
    ]
    cursor = _cursor_with_ilike_results(rows)
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        result = main._find_agent_intake_duplicate_candidates(
            cursor,
            "Jon Smith",
            date(2000, 1, 1),
            transfermarkt_link="https://transfermarkt.com/jon-smith/profile/spieler/12345",
        )
    assert len(result) == 1
    assert result[0]["confidence"] == "high"


def test_exclude_universal_id_filters_out_self_linked_player():
    # The recommendation's own currently-linked player (same name, DOB now
    # edited to differ) must not surface as a "possible duplicate of a
    # different, brand-new player" candidate.
    rows = [_candidate_row(player_id=42, name="Jon Smith", birthdate=date(2000, 1, 1))]
    cursor = _cursor_with_ilike_results(rows)
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        result = main._find_agent_intake_duplicate_candidates(
            cursor,
            "Jon Smith",
            date(2005, 6, 15),
            exclude_universal_id="external_42",
        )
    assert result == []


def test_exclude_universal_id_does_not_filter_out_other_players():
    rows = [
        _candidate_row(player_id=42, name="Jon Smith", birthdate=date(2000, 1, 1)),
        _candidate_row(player_id=43, name="Jon Smith", birthdate=date(2000, 1, 1)),
    ]
    cursor = _cursor_with_ilike_results(rows)
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        result = main._find_agent_intake_duplicate_candidates(
            cursor,
            "Jon Smith",
            date(2000, 1, 1),
            exclude_universal_id="external_42",
        )
    assert len(result) == 1
    assert result[0]["universal_id"] == "external_43"


def test_internal_player_derives_internal_universal_id():
    rows = [
        _candidate_row(
            player_id=None, cafc_id=7, name="Jon Smith", birthdate=date(2000, 1, 1), data_source="internal"
        )
    ]
    cursor = _cursor_with_ilike_results(rows)
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        result = main._find_agent_intake_duplicate_candidates(cursor, "Jon Smith", date(2000, 1, 1))
    assert result[0]["universal_id"] == "internal_7"


def test_rows_with_no_derivable_universal_id_are_skipped():
    rows = [_candidate_row(player_id=None, cafc_id=None, name="Jon Smith", birthdate=date(2000, 1, 1))]
    cursor = _cursor_with_ilike_results(rows)
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        result = main._find_agent_intake_duplicate_candidates(cursor, "Jon Smith", date(2000, 1, 1))
    assert result == []


def test_duplicate_universal_ids_across_ilike_and_fuzzy_pass_are_deduped():
    row = _candidate_row(player_id=42, name="Jon Smith", birthdate=date(2000, 1, 1))
    cursor = MagicMock()
    # Same row surfaces in both the ILIKE pass and the fuzzy fallback pass.
    cursor.fetchall.side_effect = [[row], [row]]
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        result = main._find_agent_intake_duplicate_candidates(cursor, "Jon Smith", date(2000, 1, 1))
    assert len(result) == 1


def test_sorted_high_before_medium_then_by_name_similarity_and_capped_at_5():
    rows = [
        _candidate_row(player_id=1, name="Jon Smithe", birthdate=None),  # medium, fuzzy < exact
        _candidate_row(player_id=2, name="Jon Smith", birthdate=date(2000, 1, 1)),  # high
        _candidate_row(player_id=3, name="Jon Smith", birthdate=date(1999, 1, 1)),  # medium (DOB mismatch)
        _candidate_row(player_id=4, name="Jon Smith", birthdate=date(1998, 1, 1)),  # medium
        _candidate_row(player_id=5, name="Jon Smith", birthdate=date(1997, 1, 1)),  # medium
        _candidate_row(player_id=6, name="Jon Smith", birthdate=date(1996, 1, 1)),  # medium
    ]
    cursor = _cursor_with_ilike_results(rows)
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        result = main._find_agent_intake_duplicate_candidates(cursor, "Jon Smith", date(2000, 1, 1))
    assert len(result) == 5
    assert result[0]["confidence"] == "high"
    assert all(c["confidence"] == "medium" for c in result[1:])


def test_ilike_query_orders_exact_match_first_so_it_survives_the_cap():
    # Finding 3 regression: the ILIKE candidate lookup has no ORDER BY other
    # than what we add, so Snowflake could otherwise return an arbitrary 10
    # rows for a common/short substring - excluding the real exact-name
    # duplicate entirely. Assert the SQL text prioritizes an exact
    # (normalized) name match, and that the normalized search name is bound
    # as an extra parameter for that CASE comparison.
    rows = [_candidate_row(player_id=1, name="Jon Smith", birthdate=date(2000, 1, 1))]
    cursor = _cursor_with_ilike_results(rows)
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        main._find_agent_intake_duplicate_candidates(cursor, "Jon Smith", date(2000, 1, 1))

    ilike_call = cursor.execute.call_args_list[0]
    sql, params = ilike_call.args
    assert "ORDER BY" in sql
    assert "CASE WHEN" in sql
    # search_pattern (ILIKE) then normalized_search (ORDER BY CASE), in that
    # positional order matching the %s placeholders in the query text.
    assert params == ("%jon smith%", "jon smith")


def test_exact_duplicate_survives_limit_10_cap_among_substring_decoys():
    # End-to-end version of the regression above: simulate what Snowflake's
    # ORDER BY + LIMIT 10 would actually do given our query, by having the
    # fake cursor apply the same ordering/cap logic the SQL expresses, over
    # a candidate pool of 15 decoys (all sharing the "smith" substring, none
    # an exact name match) plus 1 exact "Jon Smith" match. Without the
    # ORDER BY fix, an arbitrary unordered LIMIT 10 could easily exclude the
    # exact match; with it, the exact match must always be present.
    decoys = [
        _candidate_row(player_id=100 + i, name=f"Jon Smithers{i}", birthdate=date(1990, 1, 1))
        for i in range(15)
    ]
    exact_match = _candidate_row(player_id=42, name="Jon Smith", birthdate=date(2000, 1, 1))
    full_pool = decoys + [exact_match]

    class _OrderAwareCursor:
        """Fake cursor standing in for Snowflake: applies the same ORDER BY
        CASE + LIMIT 10 semantics the real SQL expresses, over the full
        candidate pool, so the test exercises the actual fix (not just that
        the Python code passes rows through)."""

        def __init__(self, pool):
            self.pool = pool
            self.execute_calls = []
            self._last_result = []

        def execute(self, sql, params):
            self.execute_calls.append((sql, params))
            if "ORDER BY" in sql:
                _search_pattern, normalized_search = params
                ordered = sorted(
                    self.pool,
                    key=lambda row: (0 if row[2].strip().lower() == normalized_search else 1, row[2]),
                )
                self._last_result = ordered[:10]
            else:
                # JAROWINKLER fallback pass - not exercised meaningfully here.
                self._last_result = []

        def fetchall(self):
            return self._last_result

    cursor = _OrderAwareCursor(full_pool)
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        result = main._find_agent_intake_duplicate_candidates(cursor, "Jon Smith", date(2000, 1, 1))

    assert any(c["universal_id"] == "external_42" for c in result), (
        "exact-name duplicate was excluded by the LIMIT 10 cap despite the ORDER BY fix"
    )


def test_skips_jarowinkler_fallback_when_ilike_pass_already_hits_limit():
    rows = [_candidate_row(player_id=i, name="Jon Smith", birthdate=date(2000, 1, 1)) for i in range(10)]
    cursor = MagicMock()
    cursor.fetchall.side_effect = [rows]  # only one execute() expected
    with patch.object(main, "get_table_columns", return_value=["PLAYERNAME"]), \
         patch.object(main, "read_table", return_value="players"):
        result = main._find_agent_intake_duplicate_candidates(cursor, "Jon Smith", date(2000, 1, 1))
    assert cursor.execute.call_count == 1
    assert len(result) == 5  # capped, even though 10 candidates matched


# --- _create_external_player_from_agent_intake (Task 5 squad column) -------


def _cursor_for_create(new_player_id=42):
    cursor = MagicMock()
    cursor.fetchone.return_value = (new_player_id,)
    return cursor


def test_create_external_player_includes_squadname_when_provided_and_column_exists():
    cursor = _cursor_for_create()
    with patch.object(
        main,
        "get_table_columns",
        return_value=["PLAYERID", "PLAYERNAME", "DATA_SOURCE", "BIRTHDATE", "POSITION", "TRANSFERMARKT_LINK", "SQUADNAME"],
    ):
        universal_id = main._create_external_player_from_agent_intake(
            cursor,
            player_name="Jon Smith",
            player_dob=date(2000, 1, 1),
            recommended_position="CB",
            transfermarkt_link=None,
            player_squad="Charlton Athletic",
        )
    assert universal_id == "external_42"
    insert_calls = [c for c in cursor.execute.call_args_list if "INSERT INTO players" in c.args[0]]
    assert len(insert_calls) == 1
    insert_sql, insert_params = insert_calls[0].args
    assert "SQUADNAME" in insert_sql
    assert "Charlton Athletic" in insert_params


def test_create_external_player_omits_squadname_when_not_provided():
    # Squad is fully optional: no squad typed must behave exactly as before
    # this task, with no SQUADNAME column in the INSERT at all.
    cursor = _cursor_for_create()
    with patch.object(
        main,
        "get_table_columns",
        return_value=["PLAYERID", "PLAYERNAME", "DATA_SOURCE", "BIRTHDATE", "POSITION", "TRANSFERMARKT_LINK", "SQUADNAME"],
    ):
        main._create_external_player_from_agent_intake(
            cursor,
            player_name="Jon Smith",
            player_dob=date(2000, 1, 1),
            recommended_position="CB",
            transfermarkt_link=None,
        )
    insert_sql, insert_params = [
        c for c in cursor.execute.call_args_list if "INSERT INTO players" in c.args[0]
    ][0].args
    assert "SQUADNAME" not in insert_sql


def test_create_external_player_omits_squadname_when_column_missing():
    # Defensive: even if a squad was typed, don't reference a column that
    # doesn't exist on this players table (mirrors the BIRTHDATE/POSITION/
    # TRANSFERMARKT_LINK pattern this function already follows).
    cursor = _cursor_for_create()
    with patch.object(
        main, "get_table_columns", return_value=["PLAYERID", "PLAYERNAME", "DATA_SOURCE"]
    ):
        main._create_external_player_from_agent_intake(
            cursor,
            player_name="Jon Smith",
            player_dob=date(2000, 1, 1),
            recommended_position="CB",
            transfermarkt_link=None,
            player_squad="Charlton Athletic",
        )
    insert_sql, insert_params = [
        c for c in cursor.execute.call_args_list if "INSERT INTO players" in c.args[0]
    ][0].args
    assert "SQUADNAME" not in insert_sql


def test_create_external_player_omits_squadname_when_blank_string():
    cursor = _cursor_for_create()
    with patch.object(
        main,
        "get_table_columns",
        return_value=["PLAYERID", "PLAYERNAME", "DATA_SOURCE", "SQUADNAME"],
    ):
        main._create_external_player_from_agent_intake(
            cursor,
            player_name="Jon Smith",
            player_dob=date(2000, 1, 1),
            recommended_position="CB",
            transfermarkt_link=None,
            player_squad="   ",
        )
    insert_sql, insert_params = [
        c for c in cursor.execute.call_args_list if "INSERT INTO players" in c.args[0]
    ][0].args
    assert "SQUADNAME" not in insert_sql


# --- resolve_agent_intake_player_link gate ----------------------------------


def test_resolve_raises_409_when_duplicate_candidates_found_and_not_confirmed():
    cursor = MagicMock()
    candidates = [{"universal_id": "external_1", "player_name": "Jon Smith", "confidence": "high"}]
    with patch.object(main, "_find_agent_intake_duplicate_candidates", return_value=candidates) as mock_find, \
         patch.object(main, "_create_external_player_from_agent_intake") as mock_create:
        try:
            main.resolve_agent_intake_player_link(
                cursor,
                linked_universal_id=None,
                player_manual_entry=True,
                player_name="Jon Smith",
                player_dob=date(2000, 1, 1),
                recommended_position="CB",
                transfermarkt_link=None,
            )
            assert False, "expected HTTPException"
        except HTTPException as exc:
            assert exc.status_code == 409
            assert exc.detail["code"] == "possible_duplicate_player"
            assert exc.detail["candidates"] == candidates
    mock_find.assert_called_once()
    mock_create.assert_not_called()


def test_resolve_bypasses_gate_when_confirm_new_player_true():
    cursor = MagicMock()
    candidates = [{"universal_id": "external_1", "player_name": "Jon Smith", "confidence": "high"}]
    with patch.object(main, "_find_agent_intake_duplicate_candidates", return_value=candidates) as mock_find, \
         patch.object(main, "_create_external_player_from_agent_intake", return_value="external_99") as mock_create:
        result = main.resolve_agent_intake_player_link(
            cursor,
            linked_universal_id=None,
            player_manual_entry=True,
            player_name="Jon Smith",
            player_dob=date(2000, 1, 1),
            recommended_position="CB",
            transfermarkt_link=None,
            confirm_new_player=True,
        )
    assert result == "external_99"
    mock_find.assert_not_called()
    mock_create.assert_called_once()


def test_resolve_proceeds_without_gate_when_no_candidates_found():
    cursor = MagicMock()
    with patch.object(main, "_find_agent_intake_duplicate_candidates", return_value=[]) as mock_find, \
         patch.object(main, "_create_external_player_from_agent_intake", return_value="external_99") as mock_create:
        result = main.resolve_agent_intake_player_link(
            cursor,
            linked_universal_id=None,
            player_manual_entry=True,
            player_name="Novel Name",
            player_dob=date(2003, 3, 3),
            recommended_position="CB",
            transfermarkt_link=None,
        )
    assert result == "external_99"
    mock_find.assert_called_once()
    mock_create.assert_called_once()


def test_resolve_forwards_exclude_universal_id_to_candidate_lookup():
    cursor = MagicMock()
    with patch.object(main, "_find_agent_intake_duplicate_candidates", return_value=[]) as mock_find, \
         patch.object(main, "_create_external_player_from_agent_intake", return_value="external_99"):
        main.resolve_agent_intake_player_link(
            cursor,
            linked_universal_id=None,
            player_manual_entry=True,
            player_name="Jon Smith",
            player_dob=date(2005, 6, 15),
            recommended_position="CB",
            transfermarkt_link=None,
            exclude_universal_id="external_42",
        )
    mock_find.assert_called_once_with(
        cursor, "Jon Smith", date(2005, 6, 15), None, exclude_universal_id="external_42", player_squad=None
    )


def test_resolve_forwards_player_squad_to_candidate_lookup_and_create():
    cursor = MagicMock()
    with patch.object(main, "_find_agent_intake_duplicate_candidates", return_value=[]) as mock_find, \
         patch.object(main, "_create_external_player_from_agent_intake", return_value="external_99") as mock_create:
        result = main.resolve_agent_intake_player_link(
            cursor,
            linked_universal_id=None,
            player_manual_entry=True,
            player_name="Jon Smith",
            player_dob=date(2005, 6, 15),
            recommended_position="CB",
            transfermarkt_link=None,
            player_squad="Charlton Athletic",
        )
    assert result == "external_99"
    assert mock_find.call_args.kwargs["player_squad"] == "Charlton Athletic"
    assert mock_create.call_args.kwargs["player_squad"] == "Charlton Athletic"


def test_resolve_does_not_run_gate_on_resolved_typeahead_link():
    """Path A (a valid linked_universal_id, not manual entry) never touches
    player creation or the duplicate gate at all."""
    cursor = MagicMock()
    with patch.object(main, "find_player_by_universal_or_legacy_id", return_value=({"id": 1}, "external")), \
         patch.object(main, "_find_agent_intake_duplicate_candidates") as mock_find, \
         patch.object(main, "_create_external_player_from_agent_intake") as mock_create:
        result = main.resolve_agent_intake_player_link(
            cursor,
            linked_universal_id="external_1",
            player_manual_entry=False,
            player_name="Jon Smith",
            player_dob=date(2000, 1, 1),
            recommended_position="CB",
            transfermarkt_link=None,
        )
    assert result == "external_1"
    mock_find.assert_not_called()
    mock_create.assert_not_called()


# --- Endpoint wiring ---------------------------------------------------------


class _FakeUser:
    id = 1
    email = "agent@example.com"


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


RECOMMENDATION_COLUMNS = [
    "AGENT_NAME", "AGENCY", "AGENT_EMAIL", "AGENT_NUMBER", "DATE",
    "PLAYER_NAME", "TRANSFERMARKT_LINK", "AGREEMENT_TYPE", "CONTRACT_EXPIRY",
    "CONTRACT_OPTIONS", "POTENTIAL_DEAL_TYPE", "TRANSFER_FEE",
    "CURRENT_WAGES", "EXPECTED_WAGES", "ADDITIONAL_INFO", "SUBMITTED_BY_USER_ID",
    "STATUS", "STATUS_UPDATED_AT", "STATUS_UPDATED_BY", "INTERNAL_NOTES",
    "CREATED_AT", "UPDATED_AT",
    "TRANSFER_FEE_AMOUNT", "TRANSFER_FEE_CURRENCY", "TRANSFER_FEE_MIN",
    "TRANSFER_FEE_MAX", "CURRENT_WAGES_AMOUNT", "CURRENT_WAGES_MIN",
    "CURRENT_WAGES_MAX", "CURRENT_WAGES_CURRENCY", "EXPECTED_WAGES_AMOUNT",
    "EXPECTED_WAGES_MIN", "EXPECTED_WAGES_MAX", "EXPECTED_WAGES_CURRENCY",
    "WAGE_BASIS", "RECOMMENDED_POSITION", "PLAYER_DATE_OF_BIRTH",
    "LINKED_UNIVERSAL_ID",
]


def _run_create_endpoint(confirm_new_player, resolve_side_effect):
    fake_cursor = MagicMock()
    fake_conn = MagicMock()
    fake_conn.cursor.return_value = fake_cursor
    fake_cursor.fetchone.return_value = (1,)

    with patch.object(main, "get_snowflake_connection", return_value=fake_conn), \
         patch.object(main, "validate_recommendation_schema_ready"), \
         patch.object(main, "get_table_columns", return_value=RECOMMENDATION_COLUMNS), \
         patch.object(main, "fetch_recommendation_detail", return_value=(1,)), \
         patch.object(main, "prepare_agent_recommendation_payload", return_value=_payload_stub()), \
         patch.object(main, "resolve_agent_intake_player_link", side_effect=resolve_side_effect) as mock_resolve, \
         patch.object(main, "serialize_recommendation_row", return_value={"id": 1}):

        coro = main.create_agent_recommendation(
            agent_name="Agent Smith",
            agency=None,
            agent_email="agent@example.com",
            agent_number=None,
            submission_date="2026-01-01",
            player_name="Jon Smith",
            player_date_of_birth="2000-01-01",
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
            linked_universal_id=None,
            player_manual_entry=True,
            confirm_new_player=confirm_new_player,
            supporting_file=None,
            current_user=_FakeUser(),
        )
        try:
            result = asyncio.run(coro)
            return result, mock_resolve, fake_cursor, fake_conn, None
        except HTTPException as exc:
            return None, mock_resolve, fake_cursor, fake_conn, exc


def test_create_endpoint_propagates_409_and_rolls_back_without_insert():
    detail = {"code": "possible_duplicate_player", "candidates": [{"universal_id": "external_1"}]}
    result, mock_resolve, fake_cursor, fake_conn, exc = _run_create_endpoint(
        confirm_new_player=False,
        resolve_side_effect=HTTPException(status_code=409, detail=detail),
    )
    assert result is None
    assert exc is not None
    assert exc.status_code == 409
    assert exc.detail == detail
    fake_conn.rollback.assert_called_once()
    fake_conn.commit.assert_not_called()
    insert_calls = [
        call for call in fake_cursor.execute.call_args_list
        if "INSERT INTO players" in call.args[0] or "INSERT INTO player_recommendations" in call.args[0]
    ]
    assert insert_calls == []


def test_create_endpoint_confirm_new_player_bypasses_gate_and_commits():
    result, mock_resolve, fake_cursor, fake_conn, exc = _run_create_endpoint(
        confirm_new_player=True,
        resolve_side_effect=lambda *a, **kw: "external_99",
    )
    assert exc is None
    assert result == {"id": 1}
    mock_resolve.assert_called_once()
    assert mock_resolve.call_args.kwargs["confirm_new_player"] is True
    fake_conn.commit.assert_called_once()
    fake_conn.rollback.assert_not_called()


def _run_update_endpoint(confirm_new_player, resolve_side_effect):
    fake_cursor = MagicMock()
    fake_conn = MagicMock()
    fake_conn.cursor.return_value = fake_cursor

    row = [None] * 51
    row[0] = 1
    row[24] = 1
    row[25] = "Submitted"
    row[50] = None  # no existing link, forces resolve_agent_intake_player_link path

    with patch.object(main, "get_snowflake_connection", return_value=fake_conn), \
         patch.object(main, "validate_recommendation_schema_ready"), \
         patch.object(main, "get_table_columns", return_value=RECOMMENDATION_COLUMNS), \
         patch.object(main, "fetch_recommendation_detail", return_value=tuple(row)), \
         patch.object(main, "prepare_agent_recommendation_payload", return_value=_payload_stub()), \
         patch.object(main, "resolve_agent_intake_player_link", side_effect=resolve_side_effect) as mock_resolve, \
         patch.object(main, "serialize_recommendation_row", return_value={"id": 1}):

        coro = main.update_agent_recommendation(
            recommendation_id=1,
            agent_name="Agent Smith",
            agency=None,
            agent_email="agent@example.com",
            agent_number=None,
            submission_date="2026-01-01",
            player_name="Jon Smith",
            player_date_of_birth="2000-01-01",
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
            linked_universal_id=None,
            player_manual_entry=True,
            confirm_new_player=confirm_new_player,
            supporting_file=None,
            current_user=_FakeUser(),
        )
        try:
            result = asyncio.run(coro)
            return result, mock_resolve, fake_cursor, fake_conn, None
        except HTTPException as exc:
            return None, mock_resolve, fake_cursor, fake_conn, exc


def test_update_endpoint_propagates_409_and_rolls_back_without_update():
    detail = {"code": "possible_duplicate_player", "candidates": [{"universal_id": "external_1"}]}
    result, mock_resolve, fake_cursor, fake_conn, exc = _run_update_endpoint(
        confirm_new_player=False,
        resolve_side_effect=HTTPException(status_code=409, detail=detail),
    )
    assert result is None
    assert exc is not None
    assert exc.status_code == 409
    assert exc.detail == detail
    fake_conn.rollback.assert_called_once()
    fake_conn.commit.assert_not_called()
    update_calls = [
        call for call in fake_cursor.execute.call_args_list
        if "UPDATE player_recommendations" in call.args[0]
    ]
    assert update_calls == []


def test_update_endpoint_confirm_new_player_bypasses_gate_and_commits():
    result, mock_resolve, fake_cursor, fake_conn, exc = _run_update_endpoint(
        confirm_new_player=True,
        resolve_side_effect=lambda *a, **kw: "external_99",
    )
    assert exc is None
    assert result == {"id": 1}
    mock_resolve.assert_called_once()
    assert mock_resolve.call_args.kwargs["confirm_new_player"] is True
    fake_conn.commit.assert_called_once()
    fake_conn.rollback.assert_not_called()


# --- Fix report regression: no self-collision 409 on the update path -------
#
# End-to-end: neither resolve_agent_intake_player_link nor
# _find_agent_intake_duplicate_candidates are mocked here, so this actually
# exercises the exclude_universal_id wiring through the real functions
# against a fake cursor, not just the wiring assertions above.


def test_update_endpoint_no_409_when_editing_own_linked_players_dob():
    """Editing a manual-entry recommendation's DOB (a genuine field change,
    so Task 1's should_reuse_existing_agent_intake_link correctly declines to
    reuse the link) must not raise a 409 just because the only "duplicate"
    the lookup finds is the player already linked to this recommendation."""
    fake_cursor = MagicMock()
    fake_conn = MagicMock()
    fake_conn.cursor.return_value = fake_cursor

    row = [None] * 51
    row[0] = 1
    row[24] = 1
    row[25] = "Submitted"
    row[50] = "external_42"  # recommendation's own currently-linked player

    # The PLAYERS row still has the OLD dob in the DB (2000-01-01); the agent
    # is submitting a corrected DOB (2005-06-15) for the same person.
    self_linked_player_row = _candidate_row(player_id=42, name="Jon Smith", birthdate=date(2000, 1, 1))
    # ILIKE pass finds only the self-linked player; JAROWINKLER fallback
    # (triggered since 1 row < 3) finds nothing extra.
    fake_cursor.fetchall.side_effect = [[self_linked_player_row], []]

    def table_columns_side_effect(table_name):
        if table_name == "players":
            return ["PLAYERNAME", "BIRTHDATE", "POSITION", "DATA_SOURCE", "TRANSFERMARKT_LINK", "SQUADNAME", "PLAYERID", "CAFC_PLAYER_ID"]
        return RECOMMENDATION_COLUMNS

    with patch.object(main, "get_snowflake_connection", return_value=fake_conn), \
         patch.object(main, "validate_recommendation_schema_ready"), \
         patch.object(main, "get_table_columns", side_effect=table_columns_side_effect), \
         patch.object(main, "read_table", return_value="players"), \
         patch.object(main, "fetch_recommendation_detail", return_value=tuple(row)), \
         patch.object(
             main,
             "prepare_agent_recommendation_payload",
             return_value=_payload_stub(player_name="Jon Smith", player_dob=date(2005, 6, 15)),
         ), \
         patch.object(
             main,
             "find_player_by_universal_or_legacy_id",
             return_value=(
                 (42, None, "Jon Smith", "Jon", "Smith", date(2000, 1, 1), "Charlton", "CB", "external"),
                 "external",
             ),
         ), \
         patch.object(
             main, "_create_external_player_from_agent_intake", return_value="external_99"
         ) as mock_create, \
         patch.object(main, "serialize_recommendation_row", return_value={"id": 1}):

        coro = main.update_agent_recommendation(
            recommendation_id=1,
            agent_name="Agent Smith",
            agency=None,
            agent_email="agent@example.com",
            agent_number=None,
            submission_date="2026-01-01",
            player_name="Jon Smith",
            player_date_of_birth="2005-06-15",
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
            linked_universal_id=None,
            player_manual_entry=True,
            confirm_new_player=False,  # no confirm bypass — proves the gate genuinely didn't fire
            supporting_file=None,
            current_user=_FakeUser(),
        )

        # Must NOT raise HTTPException(409, ...): the only lookup match is
        # the recommendation's own already-linked player, which is excluded.
        result = asyncio.run(coro)

    assert result == {"id": 1}
    # A genuine field change (DOB) still isn't reused per Task 1's scope —
    # it falls through to player creation, just without a spurious 409 first.
    mock_create.assert_called_once()
    fake_conn.commit.assert_called_once()
    fake_conn.rollback.assert_not_called()
