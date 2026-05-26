"""
Backfill Stage History for Players Without Position
Creates proper stage history entries for players that don't have position data.
"""

import pandas as pd
import snowflake.connector
import os
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
import sys

# Load environment variables
load_dotenv()

# Stage 2 reasons (these reasons should start at Stage 2)
STAGE_2_REASONS = ["Flagged by Live Scouting", "Flagged by Video Scouting"]

def normalize_reason(reason):
    """Normalize reason formatting to match database values"""
    reason = reason.replace(" By ", " by ")
    if reason == "Flagged by Recommendation":
        reason = "Flagged by External Recommendation"
    return reason

def determine_initial_stage(reason):
    """Determine initial stage based on reason"""
    normalized = normalize_reason(reason)
    return "Stage 2" if normalized in STAGE_2_REASONS else "Stage 1"

def get_snowflake_connection():
    """Create Snowflake connection using key-pair authentication"""
    # Load private key for authentication
    with open(os.getenv('SNOWFLAKE_PRIVATE_KEY_PATH'), 'rb') as key:
        p_key = serialization.load_pem_private_key(
            key.read(),
            password=None,
            backend=default_backend()
        )

    pkb = p_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )

    conn = snowflake.connector.connect(
        user=os.getenv('SNOWFLAKE_USERNAME'),
        account=os.getenv('SNOWFLAKE_ACCOUNT'),
        warehouse=os.getenv('SNOWFLAKE_WAREHOUSE'),
        database=os.getenv('SNOWFLAKE_DATABASE'),
        schema=os.getenv('SNOWFLAKE_SCHEMA'),
        private_key=pkb
    )

    return conn

def get_list_item_info(cursor, player_id, list_name, is_cafc_player):
    """Get list item information for a player in a specific list"""
    id_column = "CAFC_PLAYER_ID" if is_cafc_player else "PLAYER_ID"

    query = f"""
        SELECT pli.ID as LIST_ITEM_ID,
               pli.LIST_ID,
               pli.ADDED_BY,
               pli.CREATED_AT
        FROM PLAYER_LIST_ITEMS pli
        JOIN PLAYER_LISTS pl ON pli.LIST_ID = pl.ID
        WHERE pli.{id_column} = %s
          AND pl.LIST_NAME = %s
    """

    cursor.execute(query, (player_id, list_name))
    result = cursor.fetchone()

    if result:
        return {
            'list_item_id': result[0],
            'list_id': result[1],
            'added_by': result[2],
            'created_at': result[3]
        }
    return None

def has_initial_history(cursor, list_item_id):
    """Check if a player already has initial stage history (OLD_STAGE = NULL)"""
    cursor.execute("""
        SELECT COUNT(*)
        FROM PLAYER_STAGE_HISTORY
        WHERE LIST_ITEM_ID = %s
          AND OLD_STAGE IS NULL
    """, (list_item_id,))

    count = cursor.fetchone()[0]
    return count > 0

def insert_stage_history(cursor, list_item_id, list_id, player_id, old_stage, new_stage,
                        reason, description, changed_by, changed_at, is_cafc_player):
    """Insert a stage history record"""
    # Note: PLAYER_STAGE_HISTORY only has PLAYER_ID column (used for both external and CAFC players)
    query = """
        INSERT INTO PLAYER_STAGE_HISTORY
            (LIST_ITEM_ID, LIST_ID, PLAYER_ID, OLD_STAGE, NEW_STAGE, REASON,
             DESCRIPTION, CHANGED_BY, CHANGED_AT)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    cursor.execute(query, (
        list_item_id,
        list_id,
        player_id,
        old_stage,
        new_stage,
        reason,
        description,
        changed_by,
        changed_at
    ))

def process_player(cursor, player_name, player_id, list_name, current_stage, reason, is_cafc_player):
    """Process a single player's stage history"""
    normalized_reason = normalize_reason(reason)

    # Skip "Moved Club" - it's archived-only
    if normalized_reason == "Moved Club":
        print(f"      SKIP - 'Moved Club' is archived-only")
        return "skipped"

    # Get list item info
    item_info = get_list_item_info(cursor, player_id, list_name, is_cafc_player)
    if not item_info:
        print(f"      ERROR - Player not found in list '{list_name}'")
        return "error"

    list_item_id = item_info['list_item_id']

    # Check if initial history exists
    if has_initial_history(cursor, list_item_id):
        print(f"      SKIP - Already has initial history")
        return "skipped"

    # Determine initial stage
    initial_stage = determine_initial_stage(reason)

    # Insert initial entry
    insert_stage_history(
        cursor,
        list_item_id,
        item_info['list_id'],
        player_id,
        None,  # OLD_STAGE = NULL for initial entry
        initial_stage,
        normalized_reason,
        "Initial entry",
        item_info['added_by'],
        item_info['created_at'],
        is_cafc_player
    )

    entries_added = 1

    # If current stage differs from initial, add progression entry
    if current_stage != initial_stage:
        # Add 1 second to created_at for progression timestamp
        cursor.execute("SELECT DATEADD(second, 1, %s)", (item_info['created_at'],))
        progression_time = cursor.fetchone()[0]

        insert_stage_history(
            cursor,
            list_item_id,
            item_info['list_id'],
            player_id,
            initial_stage,
            current_stage,
            normalized_reason,
            "Stage progression",
            item_info['added_by'],
            progression_time,
            is_cafc_player
        )

        entries_added = 2
        print(f"      OK - Added {entries_added} entries: {initial_stage} -> {current_stage}")
    else:
        print(f"      OK - Added 1 entry: {initial_stage}")

    return "success"

def main():
    if len(sys.argv) < 2:
        print("Usage: python backfill_stage_history.py <excel_file>")
        sys.exit(1)

    excel_file = sys.argv[1]

    print("=" * 80)
    print("STAGE HISTORY BACKFILL - Players Without Position")
    print("=" * 80)

    # Step 1: Read Excel file
    print("\nStep 1: Reading Excel file...")
    df = pd.read_excel(excel_file, header=1)

    # Filter to players WITHOUT position
    df_to_fix = df[df['POSITION'].isna()].copy()

    print(f"   Found {len(df)} total players")
    print(f"   Found {len(df_to_fix)} players WITHOUT position to backfill")

    # Step 2: Connect to database
    print("\nStep 2: Connecting to Snowflake...")
    conn = get_snowflake_connection()
    cursor = conn.cursor()
    print("   Connected")

    # Step 3: Process players
    print("\n" + "=" * 80)
    print("Step 3: Processing players...")
    print("=" * 80)

    success_count = 0
    skip_count = 0
    error_count = 0

    # Group by list for organized output
    for list_name in sorted(df_to_fix['LIST_NAME'].unique()):
        list_players = df_to_fix[df_to_fix['LIST_NAME'] == list_name]

        print(f"\n   List: {list_name} ({len(list_players)} players)")

        for idx, row in list_players.iterrows():
            # Determine player ID and type
            cafc_id = row['CAFC_PLAYER_ID']
            external_id = row['PLAYERID']

            if pd.notna(cafc_id):
                player_id = int(cafc_id)
                is_cafc_player = True
                id_display = f"CAFC:{player_id}"
            elif pd.notna(external_id):
                player_id = int(external_id)
                is_cafc_player = False
                id_display = str(player_id)
            else:
                print(f"      {row['PLAYERNAME']} - ERROR: No player ID found")
                error_count += 1
                continue

            player_name = row['PLAYERNAME']
            current_stage = row['CURRENT_STAGE']
            reason = row['REASON']

            print(f"      {player_name} ({id_display}): ", end="")

            result = process_player(
                cursor,
                player_name,
                player_id,
                list_name,
                current_stage,
                reason,
                is_cafc_player
            )

            if result == "success":
                success_count += 1
            elif result == "skipped":
                skip_count += 1
            else:
                error_count += 1

    # Commit all changes
    print("\n" + "=" * 80)
    print("Committing changes...")
    conn.commit()
    print("   Committed")

    # Summary
    print("\n" + "=" * 80)
    print("BACKFILL COMPLETE")
    print("=" * 80)
    print(f"   Successfully processed: {success_count}")
    print(f"   Skipped (already have history): {skip_count}")
    print(f"   Errors: {error_count}")
    print(f"   Total: {success_count + skip_count + error_count}")

    # Close connection
    cursor.close()
    conn.close()

if __name__ == "__main__":
    main()
