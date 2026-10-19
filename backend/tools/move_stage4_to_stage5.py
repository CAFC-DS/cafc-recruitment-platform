"""Move the current Stage 4 cohort after deploying Stage 5 support.

Run from backend/: python tools/move_stage4_to_stage5.py (read-only preview).
Apply: python tools/move_stage4_to_stage5.py --apply --changed-by 301
       --expect-database DATABASE --expect-schema SCHEMA --expect-count COUNT
Uses the application's ENVIRONMENT and Snowflake configuration. Stop writes while
applying. Restart backend instances afterwards to clear their in-memory caches.
The transaction preserves old history and writes one dated transition per item.
Re-running without newly added Stage 4 players is a no-op. Do not rerun after
normal use of Stage 4 resumes: this targets the current cohort, not future ones.
"""
import argparse
from pathlib import Path
import sys
import re

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def migrate(connection, *, table_prefix, apply=False, changed_by=301,
            expected_database=None, expected_schema=None, expected_count=None):
    # Table addresses must match core_table() in the deployed application, not
    # CURRENT_DATABASE(): the connection default may still be the legacy DB.
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*", table_prefix):
        raise ValueError("Invalid target database/schema")
    database, schema = table_prefix.upper().split(".")
    items = f"{table_prefix}.player_list_items"
    lists = f"{table_prefix}.player_lists"
    history = f"{table_prefix}.player_stage_history"
    users = f"{table_prefix}.users"
    cursor = connection.cursor()
    try:
        cursor.execute("SELECT CURRENT_DATABASE(), CURRENT_SCHEMA()")
        session_database, session_schema = cursor.fetchone()
        print(f"Session default: {session_database}.{session_schema}")
        print(f"Target: {database}.{schema}")
        if apply and (database != (expected_database or "").upper() or schema != (expected_schema or "").upper()):
            raise ValueError("Database/schema do not match the expected deployment target")
        cursor.execute(f"""
            SELECT pli.ID, pli.LIST_ID, pli.PLAYER_ID, pli.CAFC_PLAYER_ID,
                   pl.LIST_CATEGORY, pl.LIST_NAME
            FROM {items} pli
            JOIN {lists} pl ON pl.ID = pli.LIST_ID
            WHERE pli.STAGE = 'Stage 4' ORDER BY pli.ID
        """)
        rows = cursor.fetchall()
        print(f"Stage 4 memberships: {len(rows)}")
        for category in sorted({row[4] or 'first_team' for row in rows}):
            print(f"  {category}: {sum((row[4] or 'first_team') == category for row in rows)}")
        if not apply:
            return len(rows)
        if expected_count != len(rows):
            raise ValueError("Stage 4 count changed; review the preview before applying")
        if not rows:
            return 0
        cursor.execute(f"SELECT ROLE, FIRSTNAME, LASTNAME FROM {users} WHERE ID = %s", (changed_by,))
        user = cursor.fetchone()
        if not user or user[0] not in ('admin', 'senior_manager'):
            raise ValueError("changed-by must identify an admin or senior manager")
        if " ".join(str(part or "").strip() for part in user[1:]).casefold() != "hashim umarji":
            raise ValueError("Migration attribution must be Hashim Umarji")

        # Explicit transaction: Snowflake defaults to autocommit. No DDL here.
        cursor.execute("BEGIN")
        try:
            for item_id, list_id, player_id, cafc_id, _, _ in rows:
                cursor.execute(f"""
                    UPDATE {items} SET STAGE = 'Stage 5'
                    WHERE ID = %s AND LIST_ID = %s AND STAGE = 'Stage 4'
                """, (item_id, list_id))
                if cursor.rowcount != 1:
                    raise RuntimeError("Stage changed during migration; rolling back")
                cursor.execute(f"""
                    INSERT INTO {history}
                    (LIST_ITEM_ID, LIST_ID, PLAYER_ID, OLD_STAGE, NEW_STAGE,
                     REASON, DESCRIPTION, CHANGED_BY, CHANGED_AT)
                    VALUES (%s, %s, %s, 'Stage 4', 'Stage 5', '',
                            'Pipeline update: moved existing Stage 4 cohort to new Stage 5',
                            %s, CURRENT_TIMESTAMP())
                """, (item_id, list_id, player_id or cafc_id, changed_by))
            for list_id in sorted({row[1] for row in rows}):
                cursor.execute(f"UPDATE {lists} SET UPDATED_AT = CURRENT_TIMESTAMP() WHERE ID = %s", (list_id,))
            cursor.execute(f"SELECT COUNT(*) FROM {items} WHERE STAGE = 'Stage 4'")
            if cursor.fetchone()[0] != 0:
                raise RuntimeError("Stage 4 is no longer empty; rolling back")
            cursor.execute("COMMIT")
        except Exception:
            cursor.execute("ROLLBACK")
            raise
        print(f"Moved {len(rows)} memberships with stage history preserved.")
        return len(rows)
    finally:
        cursor.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--changed-by', type=int, default=301, help='Hashim Umarji admin ID (301 in production)')
    parser.add_argument('--expect-database')
    parser.add_argument('--expect-schema')
    parser.add_argument('--expect-count', type=int)
    args = parser.parse_args()
    if args.apply and any(value is None for value in (args.changed_by, args.expect_database, args.expect_schema, args.expect_count)):
        parser.error('--apply requires --changed-by, --expect-database, --expect-schema and --expect-count')
    from main import get_snowflake_connection, core_table
    connection = get_snowflake_connection()
    try:
        migrate(connection, table_prefix=core_table("player_list_items").rsplit(".", 1)[0],
                apply=args.apply, changed_by=args.changed_by,
                expected_database=args.expect_database, expected_schema=args.expect_schema,
                expected_count=args.expect_count)
    finally:
        connection.close()


if __name__ == '__main__':
    main()
