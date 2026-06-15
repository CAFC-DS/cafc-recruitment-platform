"""
One-off backfill: fill NULL player_stage_history.CHANGED_AT.

Background
----------
A bulk import wrote ~973 player_stage_history rows with no CHANGED_AT. Every
analytics/display query filters or sorts on CHANGED_AT, so those rows were
silently dropped or shown with a blank date (this undercounted "ever at stage"
on the Stage-Movement tab, the "Total Data Players" metric, and showed blank
dates in the per-player stage-history modal / activity timeline).

These NULL rows are all "initial entry" events (OLD_STAGE IS NULL), i.e. "player
added to the list". Their correct timestamp is the player's add-date:
player_list_items.CREATED_AT (verified ~1s from the import's dated sibling rows).

What this does
--------------
1. Snapshots the IDs of every NULL row into PLAYER_STAGE_HISTORY_CHANGED_AT_BKP
   (created once; safe to re-run).
2. Sets CHANGED_AT = the list item's CREATED_AT where the item still exists.
3. For orphaned rows (list item since removed), sets CHANGED_AT = the import
   date for that list (earliest real CHANGED_AT on the same LIST_ID).
4. Any remainder -> earliest real CHANGED_AT table-wide (safety net).
5. Verifies no NULLs remain.

Idempotent: once no NULLs remain, re-running is a no-op.

Reverting
---------
    UPDATE player_stage_history SET CHANGED_AT = NULL
    WHERE ID IN (SELECT ID FROM player_stage_history_changed_at_bkp);

Run from backend/:  python tools/backfill_stage_history_changed_at.py
"""
import os
from dotenv import load_dotenv
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
import snowflake.connector

load_dotenv()
with open(os.getenv("SNOWFLAKE_DEV_PRIVATE_KEY_PATH", "./keys/rsa_key_unencrypted.pem"), "rb") as f:
    pk = serialization.load_pem_private_key(f.read(), password=None, backend=default_backend())
pkb = pk.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())

conn = snowflake.connector.connect(
    user=os.getenv("SNOWFLAKE_DEV_USERNAME") or os.getenv("SNOWFLAKE_USERNAME"),
    account=os.getenv("SNOWFLAKE_DEV_ACCOUNT") or os.getenv("SNOWFLAKE_ACCOUNT"),
    warehouse=os.getenv("SNOWFLAKE_DEV_WAREHOUSE") or os.getenv("SNOWFLAKE_WAREHOUSE"),
    database=os.getenv("SNOWFLAKE_DEV_DATABASE") or os.getenv("SNOWFLAKE_DATABASE"),
    schema=os.getenv("SNOWFLAKE_DEV_SCHEMA") or os.getenv("SNOWFLAKE_SCHEMA"),
    role=os.getenv("SNOWFLAKE_DEV_ROLE", "DEV_ROLE"),
    private_key=pkb,
)
cur = conn.cursor()


def scalar(sql, params=None):
    cur.execute(sql, params or [])
    return cur.fetchone()[0]


before = scalar("SELECT COUNT(*) FROM player_stage_history WHERE CHANGED_AT IS NULL")
print(f"NULL CHANGED_AT rows before: {before}")
if before == 0:
    print("Nothing to backfill. Exiting.")
    cur.close(); conn.close(); raise SystemExit(0)

# 1. Snapshot the affected row IDs (created once; AS SELECT is skipped if it exists)
cur.execute("""
    CREATE TABLE IF NOT EXISTS player_stage_history_changed_at_bkp AS
    SELECT ID, CHANGED_AT AS OLD_CHANGED_AT, CURRENT_TIMESTAMP() AS BACKED_UP_AT
    FROM player_stage_history WHERE CHANGED_AT IS NULL
""")
backed_up = scalar("SELECT COUNT(*) FROM player_stage_history_changed_at_bkp")
print(f"Backup table player_stage_history_changed_at_bkp holds {backed_up} row IDs")

# Per-list import floor (earliest real CHANGED_AT per list), captured BEFORE updates
cur.execute("""
    CREATE OR REPLACE TEMPORARY TABLE psh_import_floor AS
    SELECT LIST_ID, MIN(CHANGED_AT) AS MIN_CHANGED
    FROM player_stage_history WHERE CHANGED_AT IS NOT NULL GROUP BY LIST_ID
""")
global_floor = scalar("SELECT MIN(CHANGED_AT) FROM player_stage_history WHERE CHANGED_AT IS NOT NULL")
print(f"Global import floor (earliest real CHANGED_AT): {global_floor}")

# 2. Matched rows -> the player's add-date
cur.execute("""
    UPDATE player_stage_history psh
    SET CHANGED_AT = pli.CREATED_AT
    FROM player_list_items pli
    WHERE psh.LIST_ITEM_ID = pli.ID
      AND psh.CHANGED_AT IS NULL
      AND pli.CREATED_AT IS NOT NULL
""")
print(f"Step 2 (add-date from list item): {cur.rowcount} rows")

# 3. Orphaned rows (item removed) -> that list's import date
cur.execute("""
    UPDATE player_stage_history psh
    SET CHANGED_AT = f.MIN_CHANGED
    FROM psh_import_floor f
    WHERE psh.LIST_ID = f.LIST_ID
      AND psh.CHANGED_AT IS NULL
""")
print(f"Step 3 (orphaned -> list import date): {cur.rowcount} rows")

# 4. Safety net for anything still NULL -> global floor
cur.execute(
    "UPDATE player_stage_history SET CHANGED_AT = %s WHERE CHANGED_AT IS NULL",
    [global_floor],
)
print(f"Step 4 (remainder -> global floor): {cur.rowcount} rows")

after = scalar("SELECT COUNT(*) FROM player_stage_history WHERE CHANGED_AT IS NULL")
print(f"NULL CHANGED_AT rows after: {after}")
if after == 0:
    print("SUCCESS: all rows now have a CHANGED_AT.")
else:
    print(f"WARNING: {after} rows still NULL — investigate before relying on results.")

cur.close(); conn.close()
