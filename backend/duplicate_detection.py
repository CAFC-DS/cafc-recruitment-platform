"""Pure, DB-free duplicate-player scoring shared by Internal Player Audit
and General Clashes. No FastAPI/Snowflake imports — keep this importable
and testable without a database connection."""

import unicodedata
from typing import Optional

from rapidfuzz.distance import Levenshtein as levenshtein_module


def normalize_text(text: str) -> str:
    """Remove diacritical marks (accents) and lowercase for fuzzy comparison."""
    if not text:
        return ""
    normalized = unicodedata.normalize("NFD", text)
    return "".join(
        char for char in normalized if unicodedata.category(char) != "Mn"
    ).lower()


def _similarity(a: str, b: str) -> float:
    max_len = max(len(a), len(b), 1)
    dist = levenshtein_module.distance(a, b)
    return (1 - (dist / max_len)) * 100


def score_player_match(
    name_a: Optional[str],
    name_b: Optional[str],
    dob_a,
    dob_b,
    squad_a: Optional[str],
    squad_b: Optional[str],
    transfermarkt_a: Optional[str] = None,
    transfermarkt_b: Optional[str] = None,
) -> Optional[dict]:
    """Score a candidate duplicate pair. Returns None if no confidence tier
    is met, otherwise a dict with confidence/evidence/similarity fields.

    Tiers:
      - high: exact normalized name AND exact DOB, OR a shared non-empty
        TRANSFERMARKT_LINK (treated as definitive external-system evidence).
      - medium: exact normalized name AND exact normalized squad (both
        present and equal).
      - low: fuzzy name similarity >= 88% AND (exact or near [>=90%] squad
        match), OR an exact name match with squad missing/empty on BOTH
        sides and no DOB match (e.g. a player with no club set on either
        record) — that case still surfaces as low, it just can't be
        promoted to medium since nothing positively confirms it.
    """
    norm_name_a = normalize_text(name_a or "")
    norm_name_b = normalize_text(name_b or "")
    norm_squad_a = normalize_text(squad_a or "")
    norm_squad_b = normalize_text(squad_b or "")

    name_similarity = _similarity(norm_name_a, norm_name_b)
    squad_similarity = _similarity(norm_squad_a, norm_squad_b)

    name_exact = norm_name_a == norm_name_b and norm_name_a != ""
    dob_exact = dob_a is not None and dob_b is not None and dob_a == dob_b
    squad_exact = norm_squad_a == norm_squad_b and norm_squad_a != ""
    # Guard against the empty-vs-empty case: Levenshtein distance between
    # two empty strings is 0, which would otherwise compute a false 100%
    # "near match" for two players who both simply have no squad on file.
    squad_near = squad_similarity >= 90 and norm_squad_a != "" and norm_squad_b != ""

    tm_a = (transfermarkt_a or "").strip()
    tm_b = (transfermarkt_b or "").strip()
    transfermarkt_match = tm_a != "" and tm_b != "" and tm_a == tm_b

    both_squads_missing = norm_squad_a == "" and norm_squad_b == ""

    confidence = None
    if transfermarkt_match or (name_exact and dob_exact):
        confidence = "high"
    elif name_exact and squad_exact:
        confidence = "medium"
    elif name_similarity >= 88 and (squad_exact or squad_near):
        confidence = "low"
    elif name_exact and both_squads_missing:
        # Exact name, but neither side has squad or DOB evidence to lean
        # on (e.g. a player with no club set) — the dob_exact case was
        # already caught by the high-confidence branch above, so reaching
        # here means DOB didn't help either. Still worth surfacing, just
        # not promotable past low.
        confidence = "low"

    if confidence is None:
        return None

    evidence = []
    if transfermarkt_match:
        evidence.append("Transfermarkt link match")
    if name_exact:
        evidence.append("Name exact")
    else:
        evidence.append(f"Fuzzy {round(name_similarity, 1)}%")
    if dob_exact:
        evidence.append("DOB exact")
    elif dob_a is None or dob_b is None:
        evidence.append("DOB missing")
    else:
        evidence.append("DOB mismatch")
    if squad_exact:
        evidence.append("Squad exact")
    elif squad_near:
        evidence.append(f"Squad near {round(squad_similarity, 1)}%")
    elif norm_squad_a == "" or norm_squad_b == "":
        evidence.append("Squad unknown")
    else:
        evidence.append("Squad mismatch")

    return {
        "confidence": confidence,
        "name_similarity": round(name_similarity, 1),
        "squad_similarity": round(squad_similarity, 1),
        "evidence": evidence,
    }


def score_intake_match(
    typed_name: Optional[str],
    typed_dob,
    typed_transfermarkt: Optional[str],
    candidate_name: Optional[str],
    candidate_dob,
    candidate_transfermarkt: Optional[str],
    typed_squad: Optional[str] = None,
    candidate_squad: Optional[str] = None,
) -> Optional[dict]:
    """Score a duplicate pair from agent-portal intake vs. existing player.
    Returns None if no confidence tier is met, otherwise a dict with
    confidence/evidence/name_similarity fields.

    This function is separate from score_player_match because agent-portal
    manual entry historically did not collect squad/club evidence. Squad is
    now an optional signal (Task 5): when present on both sides it can boost
    an existing tier or, combined with a fuzzy name match, surface a medium
    match that pure name/DOB scoring would otherwise miss. Squad remains
    fully optional — every squad-free tier from before this task is
    unchanged and still the floor.

    Tiers:
      - high: exact normalized name AND exact DOB match, OR a shared non-empty
        Transfermarkt link (treated as definitive external-system evidence).
      - medium: exact normalized name with DOB missing on either side or DOB
        mismatch, OR fuzzy name similarity >= 90% AND exact DOB match.
      - squad boost (additive, only applies when both typed and candidate
        squad are present): an exact normalized squad match promotes an
        existing medium verdict to high; a near squad match (>=90%
        similarity, mirroring score_player_match's squad_near threshold)
        combined with fuzzy name similarity >= 80% can produce a medium
        verdict on its own, even when no other tier was met.
      - Otherwise: no tier, return None.
    """
    norm_name_typed = normalize_text(typed_name or "")
    norm_name_candidate = normalize_text(candidate_name or "")

    name_similarity = _similarity(norm_name_typed, norm_name_candidate)

    name_exact = norm_name_typed == norm_name_candidate and norm_name_typed != ""
    dob_exact = typed_dob is not None and candidate_dob is not None and typed_dob == candidate_dob

    tm_typed = (typed_transfermarkt or "").strip()
    tm_candidate = (candidate_transfermarkt or "").strip()
    transfermarkt_match = tm_typed != "" and tm_candidate != "" and tm_typed == tm_candidate

    norm_squad_typed = normalize_text(typed_squad or "")
    norm_squad_candidate = normalize_text(candidate_squad or "")
    squad_similarity = _similarity(norm_squad_typed, norm_squad_candidate)
    squad_exact = norm_squad_typed == norm_squad_candidate and norm_squad_typed != ""
    # Guard against the empty-vs-empty case, same as score_player_match's
    # squad_near: Levenshtein distance between two empty strings is 0, which
    # would otherwise compute a false 100% "near match" when neither side
    # has a squad on file.
    squad_near = squad_similarity >= 90 and norm_squad_typed != "" and norm_squad_candidate != ""

    confidence = None
    if transfermarkt_match or (name_exact and dob_exact):
        confidence = "high"
    elif name_exact and (typed_dob is None or candidate_dob is None):
        # Exact name with DOB missing on either side
        confidence = "medium"
    elif name_exact and typed_dob is not None and candidate_dob is not None and typed_dob != candidate_dob:
        # Exact name with DOB mismatch (both present but different)
        confidence = "medium"
    elif name_similarity >= 90 and dob_exact:
        # Fuzzy name >= 90% with exact DOB match
        confidence = "medium"

    if confidence == "medium" and squad_exact:
        # Squad boost: an exact squad match on top of an already-medium
        # verdict is strong enough corroborating evidence to promote to high.
        confidence = "high"
    elif confidence is None and squad_near and name_similarity >= 80:
        # Squad-assisted medium: no name/DOB tier was met on its own, but a
        # near-identical squad plus a reasonably close name is evidence pure
        # name/DOB scoring would otherwise miss entirely.
        confidence = "medium"

    if confidence is None:
        return None

    evidence = []
    if transfermarkt_match:
        evidence.append("Transfermarkt link match")
    if name_exact:
        evidence.append("Name exact")
    else:
        evidence.append(f"Fuzzy {round(name_similarity, 1)}%")
    if dob_exact:
        evidence.append("DOB exact")
    elif typed_dob is None or candidate_dob is None:
        evidence.append("DOB missing")
    else:
        evidence.append("DOB mismatch")
    if norm_squad_typed != "" or norm_squad_candidate != "":
        if squad_exact:
            evidence.append("Squad exact")
        elif squad_near:
            evidence.append(f"Squad near {round(squad_similarity, 1)}%")
        else:
            evidence.append("Squad mismatch")

    return {
        "confidence": confidence,
        "name_similarity": round(name_similarity, 1),
        "evidence": evidence,
    }
