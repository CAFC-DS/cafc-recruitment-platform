"""Normalized write path for intel reports (legacy PLAYER_INFORMATION).

The endpoints build and validate the report exactly as before (comma lists, wage ranges, single-value wage columns);
this module only decides where the values land:

    INTEL_REPORTS            the report's own facts (player link, type, dates, notes, action required)
    CONTACTS                 who gave the information; get-or-create on the exact name + organisation
    INTEL_TERMS              transfer fee text, current wages, expected wages
    INTEL_DEAL_TYPES         one row per potential deal type, with SEQ (canonical label)
    INTEL_RELATIONSHIPS      one row per relationship to the player, with SEQ
    INTEL_REFERENCE_DETAILS  length / relevance / rating, only for reference forms

Deleting a report deletes its dependents in the same transaction. A contact is a person we hold information about, so
it is kept even when its last report goes.
"""
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import write_path

Payload = Dict[str, Any]

CONTACT_KEY_SEPARATOR = "\x1f"

# Canonical label for each code the intel form stores; unknown values pass through (see CANONICAL_DEAL_TYPE in 010).
_DEAL_TYPE_LABELS = {
    "permanent": "Permanent Transfer",
    "free": "Free",
    "loan": "Loan",
    "loan_with_option": "Loan with Option",
    "na": "Not Applicable",
}


def deal_type_label(code: str) -> str:
    return _DEAL_TYPE_LABELS.get(code.strip().lower(), code.strip())


def ordered_unique(items: Optional[Sequence[str]], convert: Callable[[str], str] = str.strip) -> List[Tuple[int, str]]:
    """['b', 'a', 'b'] -> [(0, 'b'), (1, 'a')]: converted, blanks dropped, duplicates dropped, order kept."""
    out: List[Tuple[int, str]] = []
    seen = set()
    for item in items or []:
        value = convert(item) if item is not None else ""
        if value and value not in seen:
            seen.add(value)
            out.append((len(out), value))
    return out


def contact_key(name: str, organisation: Optional[str]) -> str:
    return f"{name}{CONTACT_KEY_SEPARATOR}{organisation or ''}"


def build_payload(report: Payload, current_min, current_max, expected_min, expected_max) -> Payload:
    """The output of main.normalize_intel_payload plus the parsed wage ranges, in the shape create/update take.

    The legacy single-value wage columns are set only when the range collapses to one number, as the legacy code did."""
    def single(low, high):
        return low if low is not None and low == high else None

    return {
        "intel_type": report["intel_type"],
        "contact_name": report["contact_name"],
        "contact_organisation": report["contact_organisation"],
        "date_of_information": report["date_of_information"],
        "contract_expiry": report["confirmed_contract_expiry"],
        "contract_options": report["contract_options"],
        "deal_types": report["potential_deal_types"],
        "transfer_fee": report["transfer_fee"],
        "conversation_notes": report["conversation_notes"],
        "action_required": report["recommendation"],
        "current_wages_single": single(current_min, current_max),
        "current_wages_min": current_min,
        "current_wages_max": current_max,
        "expected_wages_single": single(expected_min, expected_max),
        "expected_wages_min": expected_min,
        "expected_wages_max": expected_max,
        "relationships": report["relationship_to_player"],
        "length_of_relationship": report["length_of_relationship"],
        "relevance_of_relationship": report["relevance_of_relationship"],
        "reference_rating": report["reference_rating"],
    }


def next_id(cursor, T: Callable[[str], str]) -> int:
    cursor.execute(f"SELECT {T('intel_reports_id_seq')}.NEXTVAL")
    return int(cursor.fetchone()[0])


def resolve_canonical_player_id(cursor, T: Callable[[str], str], player_id: Optional[int],
                                data_source: Optional[str]) -> Optional[int]:
    """The CAFC player id for an intel row's (PLAYER_ID, DATA_SOURCE); 'internal' ids are CAFC ids, anything else IMPECT."""
    if player_id is None:
        return None
    if data_source == "internal":
        cursor.execute(f"SELECT CAFC_PLAYER_ID FROM {T('players')} WHERE CAFC_PLAYER_ID = %s", (player_id,))
    else:
        cursor.execute(
            f"SELECT CAFC_PLAYER_ID FROM {T('core_player_id_resolutions')} "
            f"WHERE SOURCE_SYSTEM = 'IMPECT' AND SOURCE_PLAYER_ID = %s",
            (str(player_id),),
        )
    row = cursor.fetchone()
    return int(row[0]) if row and row[0] is not None else None


def get_or_create_contact(cursor, T: Callable[[str], str], name: Optional[str], organisation: Optional[str]) -> Optional[int]:
    if name is None:
        return None
    key = contact_key(name, organisation)
    cursor.execute(
        f"""
        MERGE INTO {T('contacts')} t
        USING (SELECT %s AS CONTACT_KEY, %s AS CONTACT_NAME, %s AS CONTACT_ORGANISATION) s
           ON t.CONTACT_KEY = s.CONTACT_KEY
        WHEN NOT MATCHED THEN INSERT (CONTACT_NAME, CONTACT_ORGANISATION, CONTACT_KEY)
             VALUES (s.CONTACT_NAME, s.CONTACT_ORGANISATION, s.CONTACT_KEY)
        """,
        (key, name, organisation),
    )
    cursor.execute(f"SELECT CONTACT_ID FROM {T('contacts')} WHERE CONTACT_KEY = %s", (key,))
    return int(cursor.fetchone()[0])


def _write_children(cursor, T: Callable[[str], str], report_id: int, p: Payload) -> None:
    """Replace the report's terms, list rows and reference details with what the payload says."""
    cursor.execute(f"DELETE FROM {T('intel_terms')} WHERE INTEL_REPORT_ID = %s", (report_id,))
    if p["transfer_fee"] is not None:
        cursor.execute(
            f"INSERT INTO {T('intel_terms')} (INTEL_REPORT_ID, TERM_TYPE, RAW_TEXT) VALUES (%s, 'TRANSFER_FEE', %s)",
            (report_id, p["transfer_fee"]),
        )
    for term_type, amount, low, high in (
        ("CURRENT_WAGES", p["current_wages_single"], p["current_wages_min"], p["current_wages_max"]),
        ("EXPECTED_WAGES", p["expected_wages_single"], p["expected_wages_min"], p["expected_wages_max"]),
    ):
        if amount is None and low is None and high is None:
            continue
        cursor.execute(
            f"INSERT INTO {T('intel_terms')} (INTEL_REPORT_ID, TERM_TYPE, AMOUNT, AMOUNT_MIN, AMOUNT_MAX) "
            f"VALUES (%s, %s, %s, %s, %s)",
            (report_id, term_type, amount, low, high),
        )

    cursor.execute(f"DELETE FROM {T('intel_deal_types')} WHERE INTEL_REPORT_ID = %s", (report_id,))
    for seq, code in ordered_unique(p["deal_types"], deal_type_label):
        cursor.execute(
            f"INSERT INTO {T('intel_deal_types')} (INTEL_REPORT_ID, DEAL_TYPE_CODE, SEQ) VALUES (%s, %s, %s)",
            (report_id, code, seq),
        )

    cursor.execute(f"DELETE FROM {T('intel_relationships')} WHERE INTEL_REPORT_ID = %s", (report_id,))
    for seq, code in ordered_unique(p["relationships"]):
        cursor.execute(
            f"INSERT INTO {T('intel_relationships')} (INTEL_REPORT_ID, RELATIONSHIP_CODE, SEQ) VALUES (%s, %s, %s)",
            (report_id, code, seq),
        )

    cursor.execute(f"DELETE FROM {T('intel_reference_details')} WHERE INTEL_REPORT_ID = %s", (report_id,))
    if p["intel_type"] == "reference_form":
        cursor.execute(
            f"INSERT INTO {T('intel_reference_details')} "
            f"(INTEL_REPORT_ID, LENGTH_OF_RELATIONSHIP, RELEVANCE_OF_RELATIONSHIP, REFERENCE_RATING) "
            f"VALUES (%s, %s, %s, %s)",
            (report_id, p["length_of_relationship"], p["relevance_of_relationship"], p["reference_rating"]),
        )


def create(cursor, T: Callable[[str], str], p: Payload, user_id: int, player_id: Optional[int],
           data_source: Optional[str], now) -> int:
    """Create an intel report in one transaction and return its id.

    `p` carries the validated payload: intel_type, contact_name, contact_organisation, date_of_information,
    contract_expiry, contract_options, deal_types (list), transfer_fee, conversation_notes, action_required,
    current/expected wages (single value, min, max), relationships (list), length/relevance/rating."""
    with write_path.transaction(cursor):
        report_id = next_id(cursor, T)
        contact_id = get_or_create_contact(cursor, T, p["contact_name"], p["contact_organisation"])
        canonical = resolve_canonical_player_id(cursor, T, player_id, data_source)
        cursor.execute(
            f"""
            INSERT INTO {T('intel_reports')} (
                ID, USER_ID, PLAYER_ID, DATA_SOURCE, CANONICAL_PLAYER_ID, CONTACT_ID, INTEL_TYPE,
                DATE_OF_INFORMATION, CONTRACT_EXPIRY, CONTRACT_OPTIONS, CONVERSATION_NOTES, ACTION_REQUIRED, CREATED_AT
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                report_id, user_id, player_id, data_source, canonical, contact_id, p["intel_type"],
                p["date_of_information"], p["contract_expiry"], p["contract_options"], p["conversation_notes"],
                p["action_required"], now,
            ),
        )
        _write_children(cursor, T, report_id, p)
    return report_id


def update(cursor, T: Callable[[str], str], report_id: int, p: Payload, player_id: Optional[int],
           data_source: Optional[str], data_source_given: bool) -> None:
    """Edit an intel report in one transaction.

    As the legacy UPDATE: PLAYER_ID is always written (NULL when the form names no player); DATA_SOURCE only when a
    player was given; USER_ID and CREATED_AT never change."""
    with write_path.transaction(cursor):
        contact_id = get_or_create_contact(cursor, T, p["contact_name"], p["contact_organisation"])
        if not data_source_given:
            cursor.execute(f"SELECT DATA_SOURCE FROM {T('intel_reports')} WHERE ID = %s", (report_id,))
            row = cursor.fetchone()
            data_source = row[0] if row else None
        canonical = resolve_canonical_player_id(cursor, T, player_id, data_source)
        cursor.execute(
            f"""
            UPDATE {T('intel_reports')}
            SET PLAYER_ID = %s, DATA_SOURCE = %s, CANONICAL_PLAYER_ID = %s, CONTACT_ID = %s, INTEL_TYPE = %s,
                DATE_OF_INFORMATION = %s, CONTRACT_EXPIRY = %s, CONTRACT_OPTIONS = %s, CONVERSATION_NOTES = %s,
                ACTION_REQUIRED = %s
            WHERE ID = %s
            """,
            (
                player_id, data_source, canonical, contact_id, p["intel_type"], p["date_of_information"],
                p["contract_expiry"], p["contract_options"], p["conversation_notes"], p["action_required"], report_id,
            ),
        )
        _write_children(cursor, T, report_id, p)


def delete(cursor, T: Callable[[str], str], report_id: int) -> None:
    """Delete an intel report and everything that hangs off it, atomically."""
    with write_path.transaction(cursor):
        for table in ("intel_terms", "intel_deal_types", "intel_relationships", "intel_reference_details"):
            cursor.execute(f"DELETE FROM {T(table)} WHERE INTEL_REPORT_ID = %s", (report_id,))
        cursor.execute(f"DELETE FROM {T('intel_reports')} WHERE ID = %s", (report_id,))


def reassign_player(cursor, T: Callable[[str], str], keep_id: Optional[int], remove_id: Optional[int],
                    keep_source: Optional[str]) -> int:
    """Player merge: move the loser's intel onto the survivor, keeping the canonical key in step.

    Mirrors the legacy UPDATE (PLAYER_ID only; DATA_SOURCE is left as it was) and sets CANONICAL_PLAYER_ID to the
    survivor's CAFC id."""
    canonical = resolve_canonical_player_id(cursor, T, keep_id, keep_source)
    cursor.execute(
        f"UPDATE {T('intel_reports')} SET PLAYER_ID = %s, CANONICAL_PLAYER_ID = %s WHERE PLAYER_ID = %s",
        (keep_id, canonical, remove_id),
    )
    return cursor.rowcount
