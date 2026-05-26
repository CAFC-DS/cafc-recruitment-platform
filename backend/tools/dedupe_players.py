"""Repeatable dedupe for RECRUITMENT_TEST.PUBLIC.PLAYERS.

Finds rows that share `(UPPER(TRIM(PLAYERNAME)), BIRTHDATE)`, picks the
canonical PLAYERID by matching against `CAFC_DB.IMPECT_RAW.PLAYERS.PLAYERID`
via COMMONNAME, re-points downstream FKs (scout reports, list items, notes,
intel, stage history), and deletes the orphans.

Usage:
    python dedupe_players.py                 # dry-run (default)
    python dedupe_players.py --apply         # commit
    python dedupe_players.py --apply --limit 5
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import snowflake.connector
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from dotenv import load_dotenv


# Candidate FK tables. The actual columns we touch per table are detected at
# runtime via `discover_reference_columns` — schemas drift between environments
# (e.g. CAFC_PLAYER_ID may not be present on every table in every database).
CANDIDATE_FK_TABLES: tuple[str, ...] = (
    "SCOUT_REPORTS",
    "PLAYER_LIST_ITEMS",
    "PLAYER_NOTES",
    "PLAYER_INFORMATION",
    "PLAYER_STAGE_HISTORY",
)
CANDIDATE_FK_COLUMNS: tuple[str, ...] = ("PLAYER_ID", "CAFC_PLAYER_ID")


@dataclass
class PlayerRow:
    playerid: int
    playername: str
    firstname: str | None
    lastname: str | None
    birthdate: Any
    birthplace: str | None
    squadname: str | None
    position: str | None
    season: str | None
    cafc_player_id: int | None
    data_source: str | None


@dataclass
class DuplicateGroup:
    normalised_name: str
    birthdate: Any
    rows: list[PlayerRow]


@dataclass
class GroupOutcome:
    group: DuplicateGroup
    canonical_id: int | None = None
    wrong_ids: list[int] = field(default_factory=list)
    fk_counts: dict[int, dict[str, int]] = field(default_factory=dict)
    unresolved_reason: str | None = None
    applied: bool = False
    error: str | None = None


def _load_env() -> None:
    """Load .env from the backend directory regardless of where the script runs."""
    backend_dir = Path(__file__).resolve().parent.parent
    env_path = backend_dir / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()


def _get_private_key() -> bytes:
    environment = os.getenv("ENVIRONMENT", "development")
    if environment == "production":
        key_content = os.getenv("SNOWFLAKE_PRIVATE_KEY")
        if not key_content:
            raise RuntimeError("SNOWFLAKE_PRIVATE_KEY env var not set in production")
        p_key = serialization.load_pem_private_key(
            key_content.encode("utf-8"), password=None, backend=default_backend()
        )
    else:
        key_path = os.getenv("SNOWFLAKE_DEV_PRIVATE_KEY_PATH") or os.getenv(
            "SNOWFLAKE_PRIVATE_KEY_PATH"
        )
        if not key_path:
            raise RuntimeError(
                "SNOWFLAKE_DEV_PRIVATE_KEY_PATH (or SNOWFLAKE_PRIVATE_KEY_PATH) not set"
            )
        # Resolve relative paths from backend/
        key_path = Path(key_path)
        if not key_path.is_absolute():
            key_path = Path(__file__).resolve().parent.parent / key_path
        with open(key_path, "rb") as f:
            p_key = serialization.load_pem_private_key(
                f.read(), password=None, backend=default_backend()
            )
    return p_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


def _connect() -> snowflake.connector.SnowflakeConnection:
    environment = os.getenv("ENVIRONMENT", "development")
    if environment == "production":
        account = os.getenv("SNOWFLAKE_PROD_ACCOUNT") or os.getenv("SNOWFLAKE_ACCOUNT")
        user = os.getenv("SNOWFLAKE_PROD_USERNAME") or os.getenv("SNOWFLAKE_USERNAME")
        role = os.getenv("SNOWFLAKE_PROD_ROLE") or os.getenv("SNOWFLAKE_ROLE")
        warehouse = os.getenv("SNOWFLAKE_PROD_WAREHOUSE") or os.getenv("SNOWFLAKE_WAREHOUSE")
        database = os.getenv("SNOWFLAKE_PROD_DATABASE") or os.getenv("SNOWFLAKE_DATABASE")
        schema = os.getenv("SNOWFLAKE_PROD_SCHEMA") or os.getenv("SNOWFLAKE_SCHEMA")
    else:
        account = os.getenv("SNOWFLAKE_DEV_ACCOUNT") or os.getenv("SNOWFLAKE_ACCOUNT")
        user = os.getenv("SNOWFLAKE_DEV_USERNAME") or os.getenv("SNOWFLAKE_USERNAME")
        role = os.getenv("SNOWFLAKE_DEV_ROLE", "DEV_ROLE")
        warehouse = os.getenv("SNOWFLAKE_DEV_WAREHOUSE") or os.getenv("SNOWFLAKE_WAREHOUSE")
        database = os.getenv("SNOWFLAKE_DEV_DATABASE") or os.getenv("SNOWFLAKE_DATABASE")
        schema = os.getenv("SNOWFLAKE_DEV_SCHEMA") or os.getenv("SNOWFLAKE_SCHEMA")

    print(
        f"Connecting to Snowflake as {user} (role={role}, warehouse={warehouse}, "
        f"database={database}, schema={schema})"
    )

    params = {
        "user": user,
        "account": account,
        "warehouse": warehouse,
        "database": database,
        "schema": schema,
        "role": role,
        "private_key": _get_private_key(),
        "client_session_keep_alive": True,
        "login_timeout": 15,
        "network_timeout": 60,
    }
    if environment == "production":
        params["insecure_mode"] = True
    return snowflake.connector.connect(**params)


DUPLICATE_QUERY = """
WITH duplicate_players AS (
    SELECT
        UPPER(TRIM(PLAYERNAME)) AS NORMALISED_PLAYERNAME,
        BIRTHDATE,
        COUNT(*) AS DUPLICATE_COUNT
    FROM RECRUITMENT_TEST.PUBLIC.PLAYERS
    WHERE PLAYERNAME IS NOT NULL
    GROUP BY
        UPPER(TRIM(PLAYERNAME)),
        BIRTHDATE
    HAVING COUNT(*) > 1
)
SELECT
    p.PLAYERID,
    p.PLAYERNAME,
    p.FIRSTNAME,
    p.LASTNAME,
    p.BIRTHDATE,
    p.BIRTHPLACE,
    p.SQUADNAME,
    p.POSITION,
    p.SEASON,
    p.CAFC_PLAYER_ID,
    p.DATA_SOURCE,
    d.NORMALISED_PLAYERNAME
FROM RECRUITMENT_TEST.PUBLIC.PLAYERS p
JOIN duplicate_players d
    ON UPPER(TRIM(p.PLAYERNAME)) = d.NORMALISED_PLAYERNAME
   AND (
        p.BIRTHDATE = d.BIRTHDATE
        OR (p.BIRTHDATE IS NULL AND d.BIRTHDATE IS NULL)
   )
ORDER BY
    d.NORMALISED_PLAYERNAME,
    p.BIRTHDATE,
    p.PLAYERID
"""


def find_duplicate_groups(cursor) -> list[DuplicateGroup]:
    cursor.execute(DUPLICATE_QUERY)
    rows = cursor.fetchall()

    groups: dict[tuple[str, Any], DuplicateGroup] = {}
    for row in rows:
        (
            playerid,
            playername,
            firstname,
            lastname,
            birthdate,
            birthplace,
            squadname,
            position,
            season,
            cafc_player_id,
            data_source,
            normalised_name,
        ) = row
        key = (normalised_name, birthdate)
        if key not in groups:
            groups[key] = DuplicateGroup(
                normalised_name=normalised_name,
                birthdate=birthdate,
                rows=[],
            )
        groups[key].rows.append(
            PlayerRow(
                playerid=playerid,
                playername=playername,
                firstname=firstname,
                lastname=lastname,
                birthdate=birthdate,
                birthplace=birthplace,
                squadname=squadname,
                position=position,
                season=season,
                cafc_player_id=cafc_player_id,
                data_source=data_source,
            )
        )
    return list(groups.values())


def find_canonical_playerid(
    cursor, group: DuplicateGroup
) -> tuple[int | None, list[int], str | None]:
    """Look up the group's COMMONNAME in IMPECT_RAW.PLAYERS.

    Returns (canonical_id, wrong_ids, unresolved_reason). Picks the duplicate
    PLAYERID that also appears as IMPECT_RAW.PLAYERS.ID for the given COMMONNAME
    (IMPECT's `ID` column is what's stored as `PLAYERID` in the recruitment table
    for IMPECT-sourced rows).
    """
    # The user's seed example uses the surface PLAYERNAME directly as COMMONNAME.
    # All rows in a group share the normalised name, but raw spellings/casings
    # may differ; try each unique PLAYERNAME until something matches.
    candidate_names = []
    for row in group.rows:
        if row.playername and row.playername not in candidate_names:
            candidate_names.append(row.playername)

    impect_playerids: set[int] = set()
    for name in candidate_names:
        cursor.execute(
            "SELECT ID FROM CAFC_DB.IMPECT_RAW.PLAYERS WHERE COMMONNAME = %s",
            (name,),
        )
        for (impect_id,) in cursor.fetchall():
            if impect_id is not None:
                impect_playerids.add(int(impect_id))

    if not impect_playerids:
        return None, [], "no IMPECT row for COMMONNAME"

    group_ids = [row.playerid for row in group.rows]
    overlap = [pid for pid in group_ids if pid in impect_playerids]

    if len(overlap) == 0:
        return None, [], "IMPECT row(s) found but none match a duplicate PLAYERID"
    if len(overlap) > 1:
        return None, [], f"multiple PLAYERIDs in group match IMPECT: {overlap}"

    canonical = overlap[0]
    wrong = [pid for pid in group_ids if pid != canonical]
    return canonical, wrong, None


def discover_reference_columns(cursor) -> list[tuple[str, tuple[str, ...]]]:
    """Return [(table, columns)] for every candidate FK table that exists,
    listing only the candidate columns that actually exist on that table."""
    result: list[tuple[str, tuple[str, ...]]] = []
    for table in CANDIDATE_FK_TABLES:
        try:
            cursor.execute(f"DESCRIBE TABLE RECRUITMENT_TEST.PUBLIC.{table}")
        except snowflake.connector.errors.ProgrammingError as e:
            logging.warning("Skipping missing table %s: %s", table, e.msg)
            continue
        existing_cols = {row[0].upper() for row in cursor.fetchall()}
        present = tuple(c for c in CANDIDATE_FK_COLUMNS if c in existing_cols)
        if not present:
            logging.warning("Table %s has no PLAYER_ID-like columns — skipping", table)
            continue
        result.append((table, present))
    return result


def count_fk_references(
    cursor, wrong_id: int, reference_tables: list[tuple[str, tuple[str, ...]]]
) -> dict[str, int]:
    """Return {column_label: row_count} for each reference table/column."""
    counts: dict[str, int] = {}
    for table, columns in reference_tables:
        for column in columns:
            cursor.execute(
                f"SELECT COUNT(*) FROM RECRUITMENT_TEST.PUBLIC.{table} WHERE {column} = %s",
                (wrong_id,),
            )
            counts[f"{table}.{column}"] = int(cursor.fetchone()[0])
    return counts


def apply_group(
    cursor,
    conn,
    group: DuplicateGroup,
    canonical_id: int,
    wrong_ids: list[int],
    canonical_cafc_id: int | None,
    reference_tables: list[tuple[str, tuple[str, ...]]],
    dry_run: bool,
) -> None:
    """Re-point FKs and delete wrong PLAYERIDs in a single transaction."""
    try:
        for wrong_id in wrong_ids:
            wrong_row = next(r for r in group.rows if r.playerid == wrong_id)

            for table, columns in reference_tables:
                # PLAYER_ID update — always safe when source has rows.
                cursor.execute(
                    f"UPDATE RECRUITMENT_TEST.PUBLIC.{table} "
                    f"SET PLAYER_ID = %s WHERE PLAYER_ID = %s",
                    (canonical_id, wrong_id),
                )

                if "CAFC_PLAYER_ID" in columns:
                    if wrong_row.cafc_player_id is not None and canonical_cafc_id is not None:
                        cursor.execute(
                            f"UPDATE RECRUITMENT_TEST.PUBLIC.{table} "
                            f"SET CAFC_PLAYER_ID = %s WHERE CAFC_PLAYER_ID = %s",
                            (canonical_cafc_id, wrong_row.cafc_player_id),
                        )
                    elif wrong_row.cafc_player_id is not None and canonical_cafc_id is None:
                        logging.warning(
                            "Wrong PLAYERID %s has CAFC_PLAYER_ID=%s but canonical "
                            "PLAYERID %s has none — skipping CAFC_PLAYER_ID re-point "
                            "in %s (PLAYER_ID still updated)",
                            wrong_id,
                            wrong_row.cafc_player_id,
                            canonical_id,
                            table,
                        )

        placeholders = ", ".join(["%s"] * len(wrong_ids))
        cursor.execute(
            f"DELETE FROM RECRUITMENT_TEST.PUBLIC.PLAYERS "
            f"WHERE PLAYERID IN ({placeholders})",
            tuple(wrong_ids),
        )

        if dry_run:
            conn.rollback()
        else:
            conn.commit()
    except Exception:
        conn.rollback()
        raise


def format_group_header(group: DuplicateGroup) -> str:
    ids = ", ".join(str(r.playerid) for r in group.rows)
    return (
        f"{group.normalised_name} | DOB={group.birthdate} | "
        f"{len(group.rows)} rows [{ids}]"
    )


def print_dry_run_block(outcome: GroupOutcome) -> None:
    print(f"\n  {format_group_header(outcome.group)}")
    if outcome.unresolved_reason:
        print(f"    UNRESOLVED: {outcome.unresolved_reason}")
        return
    print(f"    canonical PLAYERID: {outcome.canonical_id}")
    print(f"    wrong PLAYERID(s):  {outcome.wrong_ids}")
    for wrong_id in outcome.wrong_ids:
        counts = outcome.fk_counts.get(wrong_id, {})
        nonzero = {k: v for k, v in counts.items() if v > 0}
        if nonzero:
            details = ", ".join(f"{k}={v}" for k, v in nonzero.items())
            print(f"    FK rows for {wrong_id}: {details}")
        else:
            print(f"    FK rows for {wrong_id}: (none — pure orphan)")


def write_unresolved_report(outcomes: list[GroupOutcome]) -> Path | None:
    unresolved = [o for o in outcomes if o.unresolved_reason]
    if not unresolved:
        return None
    backend_dir = Path(__file__).resolve().parent.parent
    out_dir = backend_dir / "archive" / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    out_path = out_dir / f"dedupe_unresolved_{timestamp}.txt"
    with open(out_path, "w") as f:
        f.write(f"Unresolved duplicate groups — {timestamp}\n")
        f.write("=" * 70 + "\n\n")
        for o in unresolved:
            f.write(format_group_header(o.group) + "\n")
            f.write(f"  reason: {o.unresolved_reason}\n")
            for row in o.group.rows:
                f.write(
                    f"  - PLAYERID={row.playerid} DATA_SOURCE={row.data_source} "
                    f"CAFC_PLAYER_ID={row.cafc_player_id} SQUADNAME={row.squadname}\n"
                )
            f.write("\n")
    return out_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit changes. Without this flag the script runs read-only.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most N duplicate groups (useful for incremental rollout).",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    _load_env()

    mode_banner = "APPLY" if args.apply else "DRY RUN"
    print(f"=== Player Dedupe — {mode_banner} ===")

    conn = _connect()
    cursor = conn.cursor()

    try:
        reference_tables = discover_reference_columns(cursor)
        print("Reference tables in scope:")
        for table, columns in reference_tables:
            print(f"  - {table}: {', '.join(columns)}")

        groups = find_duplicate_groups(cursor)
        print(f"Found {len(groups)} duplicate group(s).")
        if not groups:
            return 0

        if args.limit is not None:
            groups = groups[: args.limit]
            print(f"Processing first {len(groups)} group(s) due to --limit.")

        outcomes: list[GroupOutcome] = []
        for group in groups:
            outcome = GroupOutcome(group=group)
            canonical_id, wrong_ids, reason = find_canonical_playerid(cursor, group)
            if reason is not None:
                outcome.unresolved_reason = reason
                outcomes.append(outcome)
                continue

            outcome.canonical_id = canonical_id
            outcome.wrong_ids = wrong_ids

            canonical_row = next(r for r in group.rows if r.playerid == canonical_id)
            canonical_cafc_id = canonical_row.cafc_player_id

            for wid in wrong_ids:
                outcome.fk_counts[wid] = count_fk_references(cursor, wid, reference_tables)

            try:
                apply_group(
                    cursor,
                    conn,
                    group,
                    canonical_id,
                    wrong_ids,
                    canonical_cafc_id,
                    reference_tables,
                    dry_run=not args.apply,
                )
                outcome.applied = args.apply
            except Exception as e:
                logging.exception("apply_group failed for %s", format_group_header(group))
                outcome.error = str(e)

            outcomes.append(outcome)

        # Reporting
        resolved = [o for o in outcomes if not o.unresolved_reason and not o.error]
        unresolved = [o for o in outcomes if o.unresolved_reason]
        errored = [o for o in outcomes if o.error]

        total_wrong = sum(len(o.wrong_ids) for o in resolved)
        total_fk_rows = sum(
            sum(counts.values()) for o in resolved for counts in o.fk_counts.values()
        )

        print("\n--- Resolved ---")
        for o in resolved:
            print_dry_run_block(o)

        if unresolved:
            print("\n--- Unresolved (manual review) ---")
            for o in unresolved:
                print_dry_run_block(o)

        if errored:
            print("\n--- Errored ---")
            for o in errored:
                print(f"  {format_group_header(o.group)}")
                print(f"    error: {o.error}")

        print(
            f"\nSummary: {len(resolved)} resolved, {len(unresolved)} unresolved, "
            f"{len(errored)} errored; {total_wrong} wrong PLAYERID(s), "
            f"{total_fk_rows} downstream rows {'re-pointed' if args.apply else 'would be re-pointed'}."
        )

        if args.apply:
            report = write_unresolved_report(outcomes)
            if report:
                print(f"Unresolved list written to {report}")

        print(f"\nMode: {mode_banner} — {'changes committed' if args.apply else 'no changes committed'}")
        return 0 if not errored else 1
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
