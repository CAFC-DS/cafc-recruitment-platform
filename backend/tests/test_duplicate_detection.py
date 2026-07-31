import sys
import os
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from duplicate_detection import score_player_match, score_intake_match, normalize_text


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


# Tests for score_intake_match


def test_intake_high_confidence_exact_name_and_exact_dob():
    result = score_intake_match(
        typed_name="John Smith", typed_dob=date(2000, 1, 1),
        typed_transfermarkt=None,
        candidate_name="John Smith", candidate_dob=date(2000, 1, 1),
        candidate_transfermarkt=None,
    )
    assert result is not None
    assert result["confidence"] == "high"
    assert "Name exact" in result["evidence"]
    assert "DOB exact" in result["evidence"]


def test_intake_high_confidence_shared_transfermarkt_link():
    result = score_intake_match(
        typed_name="Jon Smith", typed_dob=None,
        typed_transfermarkt="https://transfermarkt.com/john-smith/profil/spieler/12345",
        candidate_name="John Smyth", candidate_dob=None,
        candidate_transfermarkt="https://transfermarkt.com/john-smith/profil/spieler/12345",
    )
    assert result is not None
    assert result["confidence"] == "high"
    assert "Transfermarkt link match" in result["evidence"]


def test_intake_medium_confidence_exact_name_missing_dob():
    result = score_intake_match(
        typed_name="John Smith", typed_dob=None,
        typed_transfermarkt=None,
        candidate_name="John Smith", candidate_dob=date(2000, 1, 1),
        candidate_transfermarkt=None,
    )
    assert result is not None
    assert result["confidence"] == "medium"
    assert "Name exact" in result["evidence"]
    assert "DOB missing" in result["evidence"]


def test_intake_medium_confidence_exact_name_mismatched_dob():
    result = score_intake_match(
        typed_name="John Smith", typed_dob=date(2000, 1, 1),
        typed_transfermarkt=None,
        candidate_name="John Smith", candidate_dob=date(1999, 5, 15),
        candidate_transfermarkt=None,
    )
    assert result is not None
    assert result["confidence"] == "medium"
    assert "Name exact" in result["evidence"]
    assert "DOB mismatch" in result["evidence"]


def test_intake_medium_confidence_fuzzy_name_90_percent_exact_dob():
    result = score_intake_match(
        typed_name="John Smith", typed_dob=date(2000, 1, 1),
        typed_transfermarkt=None,
        candidate_name="Jon Smith", candidate_dob=date(2000, 1, 1),
        candidate_transfermarkt=None,
    )
    assert result is not None
    assert result["confidence"] == "medium"
    assert result["name_similarity"] >= 90
    assert "DOB exact" in result["evidence"]


def test_intake_no_match_fuzzy_name_below_90_percent():
    result = score_intake_match(
        typed_name="John Smith", typed_dob=None,
        typed_transfermarkt=None,
        candidate_name="Alice Jones", candidate_dob=None,
        candidate_transfermarkt=None,
    )
    assert result is None


def test_intake_no_match_both_names_empty():
    result = score_intake_match(
        typed_name="", typed_dob=None,
        typed_transfermarkt=None,
        candidate_name="", candidate_dob=None,
        candidate_transfermarkt=None,
    )
    assert result is None


def test_intake_no_match_fuzzy_name_below_90_with_dob_mismatch():
    result = score_intake_match(
        typed_name="Alice Jones", typed_dob=date(2000, 1, 1),
        typed_transfermarkt=None,
        candidate_name="Bob Taylor", candidate_dob=date(1999, 5, 15),
        candidate_transfermarkt=None,
    )
    assert result is None


# Tests for score_intake_match's squad boost (Task 5)


def test_intake_squad_exact_promotes_medium_to_high():
    # Exact name with DOB missing on either side is medium on its own
    # (see test_intake_medium_confidence_exact_name_missing_dob); an exact
    # squad match on top of that is strong enough to promote to high.
    result = score_intake_match(
        typed_name="John Smith", typed_dob=None,
        typed_transfermarkt=None,
        candidate_name="John Smith", candidate_dob=date(2000, 1, 1),
        candidate_transfermarkt=None,
        typed_squad="Charlton Athletic",
        candidate_squad="Charlton Athletic",
    )
    assert result is not None
    assert result["confidence"] == "high"
    assert "Name exact" in result["evidence"]
    assert "Squad exact" in result["evidence"]


def test_intake_squad_exact_case_and_accent_insensitive_still_promotes():
    result = score_intake_match(
        typed_name="Jose Garcia", typed_dob=None,
        typed_transfermarkt=None,
        candidate_name="Jose Garcia", candidate_dob=date(2000, 1, 1),
        candidate_transfermarkt=None,
        typed_squad="josé garcía fc",
        candidate_squad="JOSE GARCIA FC",
    )
    assert result is not None
    assert result["confidence"] == "high"


def test_intake_squad_mismatch_does_not_promote_medium():
    # A medium verdict must stay medium (not be demoted or promoted) when
    # the squads are both present but clearly different.
    result = score_intake_match(
        typed_name="John Smith", typed_dob=None,
        typed_transfermarkt=None,
        candidate_name="John Smith", candidate_dob=date(2000, 1, 1),
        candidate_transfermarkt=None,
        typed_squad="Charlton Athletic",
        candidate_squad="Millwall",
    )
    assert result is not None
    assert result["confidence"] == "medium"
    assert "Squad mismatch" in result["evidence"]


def test_intake_squad_near_match_with_fuzzy_name_yields_medium():
    # Neither name/DOB tier fires on its own (fuzzy name is 85.7%, below the
    # 90% threshold needed alongside an exact DOB, and DOB is absent here
    # anyway) but a near-identical squad (>=90% similarity, mirroring
    # score_player_match's squad_near — a realistic misspelling, not just
    # whitespace, since the typed side is stripped before scoring in
    # production) combined with a reasonably close name (>=80%) is evidence
    # pure name/DOB scoring would otherwise miss.
    result = score_intake_match(
        typed_name="Michael Turner", typed_dob=None,
        typed_transfermarkt=None,
        candidate_name="Micheal Turner", candidate_dob=None,
        candidate_transfermarkt=None,
        typed_squad="Nottingham Forest",
        candidate_squad="Nottingham Forrest",
    )
    assert result is not None
    assert result["confidence"] == "medium"
    assert 80 <= result["name_similarity"] < 90
    assert any(e.startswith("Squad near") for e in result["evidence"])


def test_intake_squad_near_match_with_low_fuzzy_name_still_no_match():
    # Squad near-match alone isn't enough without at least an 80% fuzzy
    # name match — otherwise two unrelated players at the same club would
    # false-positive.
    result = score_intake_match(
        typed_name="Alice Jones", typed_dob=None,
        typed_transfermarkt=None,
        candidate_name="Bob Taylor", candidate_dob=None,
        candidate_transfermarkt=None,
        typed_squad="Nottingham Forest",
        candidate_squad="Nottingham Forrest",
    )
    assert result is None


def test_intake_squad_free_tiers_unaffected_when_squad_omitted():
    # Squad params default to None; omitting them entirely must behave
    # exactly like before this task (squad stays fully optional).
    result = score_intake_match(
        typed_name="John Smith", typed_dob=None,
        typed_transfermarkt=None,
        candidate_name="John Smith", candidate_dob=date(2000, 1, 1),
        candidate_transfermarkt=None,
    )
    assert result is not None
    assert result["confidence"] == "medium"
    assert not any(e.startswith("Squad") for e in result["evidence"])
