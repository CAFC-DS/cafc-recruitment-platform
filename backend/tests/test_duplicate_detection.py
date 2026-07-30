import sys
import os
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from duplicate_detection import score_player_match, normalize_text


def test_normalize_text_strips_accents_and_lowercases():
    assert normalize_text("José García") == "jose garcia"
    assert normalize_text("") == ""
    assert normalize_text(None) == ""


def test_high_confidence_requires_exact_name_and_exact_dob():
    result = score_player_match(
        name_a="John Smith", name_b="John Smith",
        dob_a=date(2000, 1, 1), dob_b=date(2000, 1, 1),
        squad_a="Charlton", squad_b="Millwall",
    )
    assert result is not None
    assert result["confidence"] == "high"
    assert "Name exact" in result["evidence"]
    assert "DOB exact" in result["evidence"]


def test_medium_confidence_exact_name_exact_squad_no_dob():
    result = score_player_match(
        name_a="John Smith", name_b="John Smith",
        dob_a=None, dob_b=None,
        squad_a="Charlton", squad_b="Charlton",
    )
    assert result is not None
    assert result["confidence"] == "medium"
    assert "DOB missing" in result["evidence"]
    assert "Squad exact" in result["evidence"]


def test_exact_name_with_no_squad_and_no_dob_on_either_side_is_low_not_medium():
    # Matches the "Mauricio Benitez has no club" case: exact name alone,
    # with no distinguishing squad/DOB evidence on either side, must not
    # be promoted to medium.
    result = score_player_match(
        name_a="Mauricio Benitez", name_b="Mauricio Benitez",
        dob_a=None, dob_b=None,
        squad_a=None, squad_b=None,
    )
    assert result is not None
    assert result["confidence"] == "low"
    assert "Squad unknown" in result["evidence"]
    assert "DOB missing" in result["evidence"]


def test_low_confidence_fuzzy_name_with_squad_match():
    result = score_player_match(
        name_a="Jon Smith", name_b="John Smith",
        dob_a=None, dob_b=None,
        squad_a="Charlton", squad_b="Charlton",
    )
    assert result is not None
    assert result["confidence"] == "low"
    assert result["name_similarity"] >= 88


def test_no_match_returns_none():
    result = score_player_match(
        name_a="Alice Jones", name_b="Bob Taylor",
        dob_a=None, dob_b=None,
        squad_a="Charlton", squad_b="Millwall",
    )
    assert result is None


def test_squad_mismatch_when_both_present_and_different_is_not_medium():
    result = score_player_match(
        name_a="John Smith", name_b="John Smith",
        dob_a=None, dob_b=None,
        squad_a="Charlton", squad_b="Arsenal",
    )
    assert result is None or result["confidence"] != "medium"


def test_transfermarkt_exact_match_forces_high_confidence():
    result = score_player_match(
        name_a="Jon Smith", name_b="John Smyth",
        dob_a=None, dob_b=None,
        squad_a=None, squad_b=None,
        transfermarkt_a="https://transfermarkt.com/john-smith/profil/spieler/12345",
        transfermarkt_b="https://transfermarkt.com/john-smith/profil/spieler/12345",
    )
    assert result is not None
    assert result["confidence"] == "high"
    assert "Transfermarkt link match" in result["evidence"]


def test_transfermarkt_empty_string_is_not_treated_as_a_match():
    result = score_player_match(
        name_a="Alice Jones", name_b="Bob Taylor",
        dob_a=None, dob_b=None,
        squad_a=None, squad_b=None,
        transfermarkt_a="", transfermarkt_b="",
    )
    assert result is None
