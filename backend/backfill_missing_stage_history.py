"""
Backfill missing player list stage history.

Repairs player_stage_history so the latest recorded stage matches
player_list_items.STAGE, including returns from Archived back into an active stage.

Usage:
    python backfill_missing_stage_history.py
"""

from collections import defaultdict
from datetime import datetime, timedelta
import logging
import os

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from dotenv import load_dotenv
import snowflake.connector


load_dotenv()


def get_private_key_bytes():
    key_path = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")
    if not key_path:
        raise RuntimeError("SNOWFLAKE_PRIVATE_KEY_PATH is not set")

    with open(key_path, "rb") as key_file:
        private_key = serialization.load_pem_private_key(
            key_file.read(),
            password=None,
            backend=default_backend(),
        )

    return private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


def get_snowflake_connection():
    return snowflake.connector.connect(
        user=os.getenv("SNOWFLAKE_USERNAME"),
        account=os.getenv("SNOWFLAKE_ACCOUNT"),
        warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
        database=os.getenv("SNOWFLAKE_DATABASE"),
        schema=os.getenv("SNOWFLAKE_SCHEMA"),
        role=os.getenv("SNOWFLAKE_ROLE"),
        private_key=get_private_key_bytes(),
    )


def ensure_player_stage_history_table(cursor):
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS player_stage_history (
            ID INTEGER AUTOINCREMENT,
            LIST_ITEM_ID INTEGER NOT NULL,
            LIST_ID INTEGER NOT NULL,
            PLAYER_ID INTEGER,
            OLD_STAGE VARCHAR(100),
            NEW_STAGE VARCHAR(100) NOT NULL,
            REASON VARCHAR(255) NOT NULL,
            DESCRIPTION VARCHAR(2000),
            CHANGED_BY INTEGER NOT NULL,
            CHANGED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (ID)
        )
    """
    )


def insert_history(
    cursor,
    list_item_id,
    list_id,
    player_id,
    old_stage,
    new_stage,
    changed_by,
    changed_at,
    description,
):
    cursor.execute(
        """
        INSERT INTO player_stage_history
        (LIST_ITEM_ID, LIST_ID, PLAYER_ID, OLD_STAGE, NEW_STAGE, REASON, DESCRIPTION, CHANGED_BY, CHANGED_AT)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """,
        (
            list_item_id,
            list_id,
            player_id,
            old_stage,
            new_stage,
            "",
            description,
            changed_by,
            changed_at,
        ),
    )


def infer_initial_stage(current_stage):
    if current_stage == "Stage 1":
        return "Stage 1"
    return "Stage 1"


def main():
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        ensure_player_stage_history_table(cursor)

        cursor.execute(
            """
            SELECT
                pli.ID,
                pli.LIST_ID,
                COALESCE(pli.PLAYER_ID, pli.CAFC_PLAYER_ID) AS RESOLVED_PLAYER_ID,
                pli.STAGE,
                pli.ADDED_BY,
                pli.CREATED_AT
            FROM player_list_items pli
            ORDER BY pli.LIST_ID, pli.ID
        """
        )
        list_items = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                psh.ID,
                psh.LIST_ITEM_ID,
                psh.OLD_STAGE,
                psh.NEW_STAGE,
                psh.CHANGED_BY,
                psh.CHANGED_AT
            FROM player_stage_history psh
            ORDER BY psh.LIST_ITEM_ID, psh.CHANGED_AT, psh.ID
        """
        )
        history_rows = cursor.fetchall()

        history_by_item = defaultdict(list)
        for row in history_rows:
            history_by_item[row[1]].append(
                {
                    "id": row[0],
                    "old_stage": row[2],
                    "new_stage": row[3],
                    "changed_by": row[4],
                    "changed_at": row[5],
                }
            )

        inserted_initial = 0
        inserted_progression = 0
        skipped = 0

        for item_id, list_id, player_id, current_stage, added_by, created_at in list_items:
            histories = history_by_item.get(item_id, [])

            if not histories:
                initial_stage = infer_initial_stage(current_stage)
                insert_history(
                    cursor=cursor,
                    list_item_id=item_id,
                    list_id=list_id,
                    player_id=player_id,
                    old_stage=None,
                    new_stage=initial_stage,
                    changed_by=added_by,
                    changed_at=created_at,
                    description="Initial entry",
                )
                inserted_initial += 1

                latest_stage = initial_stage
                latest_changed_at = created_at
            else:
                latest_record = histories[-1]
                latest_stage = latest_record["new_stage"]
                latest_changed_at = latest_record["changed_at"]

            if latest_stage == current_stage:
                skipped += 1
                continue

            base_progression_time = latest_changed_at or created_at or datetime.utcnow()
            progression_time = base_progression_time + timedelta(seconds=1)
            insert_history(
                cursor=cursor,
                list_item_id=item_id,
                list_id=list_id,
                player_id=player_id,
                old_stage=latest_stage,
                new_stage=current_stage,
                changed_by=added_by,
                changed_at=progression_time,
                description="Stage progression",
            )
            inserted_progression += 1

        conn.commit()

        print("Stage history backfill complete")
        print(f"Initial rows inserted: {inserted_initial}")
        print(f"Progression rows inserted: {inserted_progression}")
        print(f"Items already aligned: {skipped}")

    except Exception as exc:
        if conn:
            conn.rollback()
        logging.exception("Failed to backfill missing stage history")
        raise
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    main()
