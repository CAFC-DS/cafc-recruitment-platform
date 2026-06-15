"""
Seed the Emerging Talent shortlists (U21 + U18).

Creates one list per first-team position group for EACH emerging-talent
category, reusing the exact first-team LIST_NAMEs so the pitch view, list
ordering and POSITION_TO_LIST_NAME mapping all work identically. The lists
start empty; players are added via the UI like the first-team lists.

Idempotent: skips any (LIST_NAME, LIST_CATEGORY) that already exists, so it is
safe to re-run. Owned by an admin user.

IMPORTANT — privileges: player_lists is owned by ACCOUNTADMIN and the normal
DEV/APP roles only have DML (no MODIFY), so the one-time ADD COLUMN below needs a
role with MODIFY. On the FIRST run (to add the column) set SNOWFLAKE_SEED_ROLE to
such a role:

    SNOWFLAKE_SEED_ROLE=ACCOUNTADMIN python tools/seed_emerging_talent_lists.py

Once the column exists, subsequent runs work under the normal role (INSERT/UPDATE
are enough). The same one-time DDL also lives in
backend/migrations/add_list_category_to_player_lists.sql.

Run from backend/:  python tools/seed_emerging_talent_lists.py
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
    # Allow a privileged role override for the one-time ADD COLUMN (player_lists
    # is owned by ACCOUNTADMIN). Defaults to the normal dev role for the inserts.
    role=os.getenv("SNOWFLAKE_SEED_ROLE") or os.getenv("SNOWFLAKE_DEV_ROLE", "DEV_ROLE"),
    private_key=pkb,
)
cur = conn.cursor()

EMERGING_CATEGORIES = ["emerging_talent_u21", "emerging_talent_u18"]

# 1. Ensure LIST_CATEGORY column exists and existing rows are backfilled to first_team
try:
    cur.execute("ALTER TABLE player_lists ADD COLUMN LIST_CATEGORY VARCHAR(50) DEFAULT 'first_team'")
    print("Added LIST_CATEGORY column to player_lists")
except Exception as e:
    print(f"LIST_CATEGORY column already present [{e}]")
cur.execute("UPDATE player_lists SET LIST_CATEGORY = 'first_team' WHERE LIST_CATEGORY IS NULL")
print(f"Backfilled {cur.rowcount} existing rows to 'first_team'")

# 2. Pick an admin to own the seeded lists
cur.execute("SELECT ID, USERNAME FROM users WHERE LOWER(ROLE) = 'admin' ORDER BY ID LIMIT 1")
owner = cur.fetchone()
if not owner:
    raise SystemExit("No admin user found to own the seeded lists.")
owner_id, owner_name = owner[0], owner[1]
print(f"Owner for seeded lists: {owner_name} (id {owner_id})")

# 3. First-team position list names to replicate (reuse exactly)
cur.execute(
    "SELECT DISTINCT LIST_NAME FROM player_lists "
    "WHERE LIST_CATEGORY = 'first_team' AND LIST_NAME IS NOT NULL ORDER BY LIST_NAME"
)
names = [r[0] for r in cur.fetchall()]
print(f"Replicating {len(names)} position lists: {names}")

# 4. Seed each category x name (skip if it already exists)
created = 0
for cat in EMERGING_CATEGORIES:
    label = "U21" if cat.endswith("u21") else "U18"
    for name in names:
        cur.execute(
            "SELECT COUNT(*) FROM player_lists WHERE TRIM(LIST_NAME) = TRIM(%s) AND LIST_CATEGORY = %s",
            [name, cat],
        )
        if cur.fetchone()[0] > 0:
            continue
        cur.execute(
            "INSERT INTO player_lists (LIST_NAME, DESCRIPTION, USER_ID, LIST_CATEGORY) VALUES (%s, %s, %s, %s)",
            [name, f"Emerging Talent {label} — {name}", owner_id, cat],
        )
        created += 1
conn.commit()
print(f"Created {created} new emerging-talent lists.")

# 5. Report final state
cur.execute("SELECT LIST_CATEGORY, COUNT(*) FROM player_lists GROUP BY LIST_CATEGORY ORDER BY 1")
print("Lists per category now:")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]}")

cur.close()
conn.close()
