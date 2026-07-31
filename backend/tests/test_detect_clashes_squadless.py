"""
Tests for Task 7 of the duplicate-players fix plan: promoting exact-name,
squad-less external/external pairs in GET /admin/detect-clashes from "low"
to "medium" confidence.

Agent-portal manual entries (pre-Task-5) never collected squad, so an exact
name match between two DATA_SOURCE='external' rows with no squad, DOB, or
Transfermarkt evidence used to fall all the way to "low" confidence via
score_player_match's squad-emptiness branch (or the endpoint's own "low"
fallback when score_player_match returns None) -- burying exactly the
duplicates this effort cares about at the bottom of General Clashes, or past
max_results. This narrowly promotes just that case to "medium", leaving
every other combination (internal/internal pairs, pairs with DOB or
Transfermarkt evidence, pairs with squad data) untouched.
"""
import sys
import os
from datetime import date
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main


class _FakeAdminUser:
    id = 1
    role = main.ROLE_ADMIN
    email = "admin@example.com"


def _player_row(
    cafc_id,
    player_id,
    name,
    squad=None,
    data_source="external",
    firstname="Jon",
    lastname="Smith",
    birthdate=None,
    transfermarkt=None,
):
    return (cafc_id, player_id, name, squad, data_source, firstname, lastname, birthdate, transfermarkt)


async def _call(rows):
    fake_cursor = MagicMock()
    # detect_data_clashes issues further queries after the players query
    # (scout_reports "has_reports" lookups per data source, then fixture
    # clashes); none of those should return rows for this test's purposes.
    def _fetchall(*_args, **_kwargs):
        if not hasattr(_fetchall, "called"):
            _fetchall.called = True
            return rows
        return []
    fake_cursor.fetchall.side_effect = _fetchall
    fake_conn = MagicMock()
    fake_conn.cursor.return_value = fake_cursor

    with patch.object(main, "get_snowflake_connection", return_value=fake_conn), \
         patch.object(main, "has_column", return_value=True):
        result = await main.detect_data_clashes(current_user=_FakeAdminUser())
    return result


def _find_pair_confidence(result, name):
    matches = [
        c for c in result["player_clashes"]
        if c["player1"]["name"] == name and c["player2"]["name"] == name
    ]
    assert len(matches) == 1, f"expected exactly one clash for {name!r}, got {len(matches)}"
    return matches[0]


import asyncio


def test_external_external_exact_name_no_evidence_promoted_to_medium():
    rows = [
        _player_row(None, 1, "Squadless Duplicate", squad=None, data_source="external", birthdate=None, transfermarkt=None),
        _player_row(None, 2, "Squadless Duplicate", squad=None, data_source="external", birthdate=None, transfermarkt=None),
    ]
    result = asyncio.run(_call(rows))
    clash = _find_pair_confidence(result, "Squadless Duplicate")
    assert clash["confidence"] == "medium"
    assert clash["evidence"] == ["Name exact, no squad on file"]


def test_internal_internal_exact_name_no_evidence_stays_low():
    rows = [
        _player_row(101, None, "Internal Duplicate", squad=None, data_source="internal", birthdate=None, transfermarkt=None),
        _player_row(102, None, "Internal Duplicate", squad=None, data_source="internal", birthdate=None, transfermarkt=None),
    ]
    result = asyncio.run(_call(rows))
    clash = _find_pair_confidence(result, "Internal Duplicate")
    assert clash["confidence"] == "low"


def test_external_external_with_dob_match_unaffected_stays_high():
    dob = date(2000, 1, 1)
    rows = [
        _player_row(None, 1, "Dob Match Duplicate", squad=None, data_source="external", birthdate=dob, transfermarkt=None),
        _player_row(None, 2, "Dob Match Duplicate", squad=None, data_source="external", birthdate=dob, transfermarkt=None),
    ]
    result = asyncio.run(_call(rows))
    clash = _find_pair_confidence(result, "Dob Match Duplicate")
    # name_exact + dob_exact -> "high" per score_player_match, unaffected by
    # our override (which only fires when confidence is otherwise "low").
    assert clash["confidence"] == "high"


def test_external_external_with_transfermarkt_match_unaffected_stays_high():
    rows = [
        _player_row(None, 1, "Tm Match Duplicate", squad=None, data_source="external", birthdate=None, transfermarkt="tm/123"),
        _player_row(None, 2, "Tm Match Duplicate", squad=None, data_source="external", birthdate=None, transfermarkt="tm/123"),
    ]
    result = asyncio.run(_call(rows))
    clash = _find_pair_confidence(result, "Tm Match Duplicate")
    assert clash["confidence"] == "high"


def test_external_external_with_squad_data_unaffected():
    rows = [
        _player_row(None, 1, "Squad Match Duplicate", squad="Charlton", data_source="external", birthdate=None, transfermarkt=None),
        _player_row(None, 2, "Squad Match Duplicate", squad="Charlton", data_source="external", birthdate=None, transfermarkt=None),
    ]
    result = asyncio.run(_call(rows))
    clash = _find_pair_confidence(result, "Squad Match Duplicate")
    # name_exact + squad_exact -> "medium" naturally via score_player_match;
    # our override only changes evidence/behavior when it would otherwise be
    # "low", so this should be medium with score_player_match's own evidence,
    # not our override's evidence string.
    assert clash["confidence"] == "medium"
    assert clash["evidence"] != ["Name exact, no squad on file"]


def test_external_external_squads_present_but_mismatched_stays_low():
    # Squads present on both sides but different (and not near-similar), no
    # DOB, no TM -> score_player_match returns None (no tier met) -> the
    # endpoint's own "low" fallback. This is the literal "scored is None"
    # case; unlike the squad-empty case, evidence *does* exist here (each
    # side has a squad, they just don't match), so it must NOT be promoted.
    rows = [
        _player_row(None, 1, "Mismatched Squad Duplicate", squad="Charlton", data_source="external", birthdate=None, transfermarkt=None),
        _player_row(None, 2, "Mismatched Squad Duplicate", squad="Millwall", data_source="external", birthdate=None, transfermarkt=None),
    ]
    result = asyncio.run(_call(rows))
    clash = _find_pair_confidence(result, "Mismatched Squad Duplicate")
    assert clash["confidence"] == "low"
    assert clash["evidence"] != ["Name exact, no squad on file"]


def test_external_external_no_squad_but_dob_present_and_different_stays_low():
    # No squad on either side (so score_player_match's both_squads_missing
    # branch gives "low"), but DOB *is* present on both rows (just
    # different) -- this is evidence, not absence of it, so our override's
    # "birthdate is None on both sides" check must keep this at "low"
    # rather than promoting it.
    rows = [
        _player_row(None, 1, "Dob Present Mismatch Duplicate", squad=None, data_source="external", birthdate=date(2000, 1, 1), transfermarkt=None),
        _player_row(None, 2, "Dob Present Mismatch Duplicate", squad=None, data_source="external", birthdate=date(1999, 6, 15), transfermarkt=None),
    ]
    result = asyncio.run(_call(rows))
    clash = _find_pair_confidence(result, "Dob Present Mismatch Duplicate")
    assert clash["confidence"] == "low"
    assert clash["evidence"] != ["Name exact, no squad on file"]
