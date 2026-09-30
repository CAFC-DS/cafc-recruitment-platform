"""Normalized write path for recommendations.

The legacy code builds a payload dict in the LEGACY shape (comma-joined strings for positions / deal types /
agreement types / contract options, flat fee and wage columns). That payload and its validation are unchanged;
this module only decides where the values land:

    RECOMMENDATIONS                        the recommendation's own facts
    RECOMMENDATION_TERMS                   fee / current wages / expected wages (amount, min, max, currency)
    RECOMMENDATION_POSITIONS / _DEAL_TYPES / _AGREEMENT_TYPES / _CONTRACT_OPTIONS    one row per list item, with SEQ
    AGENT_PROFILES                         agent name / agency / email / number (the submitter's profile)

The legacy table repeated the agent's details on every recommendation. The payload takes them from the profile
when the profile has them and from the submitted form when it does not, so a blank profile field is FILLED from
the form here (never overwritten), which keeps the compat view identical to what the legacy table would hold.
"""
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

import write_path

Payload = Dict[str, Any]

LISTS = (
    # payload key, junction table, code column
    ("RECOMMENDED_POSITION", "recommendation_positions", "POSITION_CODE"),
    ("POTENTIAL_DEAL_TYPE", "recommendation_deal_types", "DEAL_TYPE_CODE"),
    ("AGREEMENT_TYPE", "recommendation_agreement_types", "AGREEMENT_TYPE_CODE"),
    ("CONTRACT_OPTIONS", "recommendation_contract_options", "CONTRACT_OPTION_CODE"),
)

# term type -> (amount key, min key, max key, currency key) in the legacy payload
TERMS = {
    "TRANSFER_FEE": ("TRANSFER_FEE_AMOUNT", "TRANSFER_FEE_MIN", "TRANSFER_FEE_MAX", "TRANSFER_FEE_CURRENCY"),
    "CURRENT_WAGES": ("CURRENT_WAGES_AMOUNT", "CURRENT_WAGES_MIN", "CURRENT_WAGES_MAX", "CURRENT_WAGES_CURRENCY"),
    "EXPECTED_WAGES": ("EXPECTED_WAGES_AMOUNT", "EXPECTED_WAGES_MIN", "EXPECTED_WAGES_MAX", "EXPECTED_WAGES_CURRENCY"),
}

_UNIVERSAL_ID = re.compile(r"^(internal|external)_(\d+)$")


def split_list(value: Optional[str]) -> List[Tuple[int, str]]:
    """'DM, CM,DM' -> [(0, 'DM'), (1, 'CM')]: trimmed, blanks dropped, duplicates dropped, original order kept."""
    out: List[Tuple[int, str]] = []
    seen = set()
    for part in str(value).split(",") if value is not None else []:
        item = part.strip()
        if item and item not in seen:
            seen.add(item)
            out.append((len(out), item))
    return out


def next_id(cursor, T: Callable[[str], str]) -> int:
    """New ids come from a sequence fetched explicitly: no 'ORDER BY CREATED_AT DESC LIMIT 1' read-back race."""
    cursor.execute(f"SELECT {T('recommendations_id_seq')}.NEXTVAL")
    return int(cursor.fetchone()[0])


def resolve_canonical_player_id(cursor, T: Callable[[str], str], universal_id: Optional[str]) -> Optional[int]:
    """'internal_<cafc id>' / 'external_<impect id>' -> the canonical CAFC player id, or None if it does not resolve."""
    match = _UNIVERSAL_ID.match(universal_id or "")
    if not match:
        return None
    kind, raw = match.groups()
    if kind == "internal":
        cursor.execute(f"SELECT CAFC_PLAYER_ID FROM {T('players')} WHERE CAFC_PLAYER_ID = %s", (int(raw),))
    else:
        cursor.execute(
            f"SELECT CAFC_PLAYER_ID FROM {T('core_player_id_resolutions')} "
            f"WHERE SOURCE_SYSTEM = 'IMPECT' AND SOURCE_PLAYER_ID = %s",
            (raw,),
        )
    row = cursor.fetchone()
    return int(row[0]) if row and row[0] is not None else None


def fill_profile_blanks(cursor, T: Callable[[str], str], user_id: int, payload: Payload) -> None:
    """Copy the agent details the payload resolved into blank profile fields (never overwriting a filled one)."""
    values = (payload.get("AGENT_NAME"), payload.get("AGENCY"), payload.get("AGENT_EMAIL"), payload.get("AGENT_NUMBER"))
    cursor.execute(f"SELECT 1 FROM {T('agent_profiles')} WHERE USER_ID = %s", (user_id,))
    if cursor.fetchone():
        cursor.execute(
            f"""
            UPDATE {T('agent_profiles')}
            SET AGENT_NAME   = COALESCE(NULLIF(TRIM(AGENT_NAME), ''),   %s),
                AGENCY       = COALESCE(NULLIF(TRIM(AGENCY), ''),       %s),
                AGENT_EMAIL  = COALESCE(NULLIF(TRIM(AGENT_EMAIL), ''),  %s),
                AGENT_NUMBER = COALESCE(NULLIF(TRIM(AGENT_NUMBER), ''), %s),
                UPDATED_AT   = CURRENT_TIMESTAMP()
            WHERE USER_ID = %s
              AND ((NULLIF(TRIM(AGENT_NAME), '')   IS NULL AND %s IS NOT NULL)
                OR (NULLIF(TRIM(AGENCY), '')       IS NULL AND %s IS NOT NULL)
                OR (NULLIF(TRIM(AGENT_EMAIL), '')  IS NULL AND %s IS NOT NULL)
                OR (NULLIF(TRIM(AGENT_NUMBER), '') IS NULL AND %s IS NOT NULL))
            """,
            values + (user_id,) + values,
        )
    else:
        cursor.execute(
            f"INSERT INTO {T('agent_profiles')} (USER_ID, AGENT_NAME, AGENCY, AGENT_EMAIL, AGENT_NUMBER) "
            f"VALUES (%s, %s, %s, %s, %s)",
            (user_id,) + values,
        )


def _write_children(cursor, T: Callable[[str], str], recommendation_id: int, payload: Payload) -> None:
    """Replace the recommendation's terms and list rows with what the payload says (used by create and edit)."""
    cursor.execute(f"DELETE FROM {T('recommendation_terms')} WHERE RECOMMENDATION_ID = %s", (recommendation_id,))
    for term_type, (amount_key, min_key, max_key, currency_key) in TERMS.items():
        amount, low, high = payload.get(amount_key), payload.get(min_key), payload.get(max_key)
        if amount is None and low is None and high is None:
            continue
        cursor.execute(
            f"INSERT INTO {T('recommendation_terms')} "
            f"(RECOMMENDATION_ID, TERM_TYPE, AMOUNT, AMOUNT_MIN, AMOUNT_MAX, CURRENCY) VALUES (%s, %s, %s, %s, %s, %s)",
            (recommendation_id, term_type, amount, low, high, payload.get(currency_key)),
        )
    for payload_key, table, code_column in LISTS:
        cursor.execute(f"DELETE FROM {T(table)} WHERE RECOMMENDATION_ID = %s", (recommendation_id,))
        for seq, code in split_list(payload.get(payload_key)):
            cursor.execute(
                f"INSERT INTO {T(table)} (RECOMMENDATION_ID, {code_column}, SEQ) VALUES (%s, %s, %s)",
                (recommendation_id, code, seq),
            )


def create(cursor, T: Callable[[str], str], payload: Payload, user_id: int, linked_universal_id: Optional[str],
           now) -> int:
    """Create a recommendation in one transaction and return its id."""
    with write_path.transaction(cursor):
        recommendation_id = next_id(cursor, T)
        canonical = resolve_canonical_player_id(cursor, T, linked_universal_id)
        cursor.execute(
            f"""
            INSERT INTO {T('recommendations')} (
                ID, SUBMITTED_BY_USER_ID, PLAYER_NAME, PLAYER_DATE_OF_BIRTH, DATE, TRANSFERMARKT_LINK,
                CONTRACT_EXPIRY, ADDITIONAL_INFO, INTERNAL_NOTES, WAGE_BASIS, STATUS, STATUS_UPDATED_AT,
                STATUS_UPDATED_BY, AGENT_STATUS, AGENT_STATUS_UPDATED_AT, LINKED_CANONICAL_PLAYER_ID,
                LINKED_UNIVERSAL_ID, TRANSFER_FEE_TEXT, CURRENT_WAGES_LEGACY, EXPECTED_WAGES_LEGACY,
                CREATED_AT, UPDATED_AT
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, 'Submitted', %s, NULL, 'Active', NULL, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                recommendation_id, user_id, payload["PLAYER_NAME"], payload.get("PLAYER_DATE_OF_BIRTH"),
                payload["DATE"], payload["TRANSFERMARKT_LINK"], payload["CONTRACT_EXPIRY"],
                payload["ADDITIONAL_INFO"], payload.get("WAGE_BASIS"), now, canonical, linked_universal_id,
                payload["TRANSFER_FEE"], payload["CURRENT_WAGES"], payload["EXPECTED_WAGES"], now, now,
            ),
        )
        _write_children(cursor, T, recommendation_id, payload)
        fill_profile_blanks(cursor, T, user_id, payload)
    return recommendation_id


def update(cursor, T: Callable[[str], str], recommendation_id: int, payload: Payload,
           linked_universal_id: Optional[str], user_id: int, now) -> None:
    """Edit a recommendation (agent edit of a still-'Submitted' one) in one transaction."""
    with write_path.transaction(cursor):
        canonical = resolve_canonical_player_id(cursor, T, linked_universal_id)
        cursor.execute(
            f"""
            UPDATE {T('recommendations')}
            SET PLAYER_NAME = %s, PLAYER_DATE_OF_BIRTH = %s, DATE = %s, TRANSFERMARKT_LINK = %s,
                CONTRACT_EXPIRY = %s, ADDITIONAL_INFO = %s, WAGE_BASIS = %s, LINKED_CANONICAL_PLAYER_ID = %s,
                LINKED_UNIVERSAL_ID = %s, TRANSFER_FEE_TEXT = %s, CURRENT_WAGES_LEGACY = %s,
                EXPECTED_WAGES_LEGACY = %s, UPDATED_AT = %s
            WHERE ID = %s
            """,
            (
                payload["PLAYER_NAME"], payload.get("PLAYER_DATE_OF_BIRTH"), payload["DATE"],
                payload["TRANSFERMARKT_LINK"], payload["CONTRACT_EXPIRY"], payload["ADDITIONAL_INFO"],
                payload.get("WAGE_BASIS"), canonical, linked_universal_id, payload["TRANSFER_FEE"],
                payload["CURRENT_WAGES"], payload["EXPECTED_WAGES"], now, recommendation_id,
            ),
        )
        _write_children(cursor, T, recommendation_id, payload)
        fill_profile_blanks(cursor, T, user_id, payload)


def relink_player(cursor, T: Callable[[str], str], old_universal_id: str, new_universal_id: str) -> int:
    """Player merge: point every recommendation linked to `old` at `new`, keeping the canonical key in step."""
    canonical = resolve_canonical_player_id(cursor, T, new_universal_id)
    cursor.execute(
        f"UPDATE {T('recommendations')} SET LINKED_UNIVERSAL_ID = %s, LINKED_CANONICAL_PLAYER_ID = %s "
        f"WHERE LINKED_UNIVERSAL_ID = %s",
        (new_universal_id, canonical, old_universal_id),
    )
    return cursor.rowcount
