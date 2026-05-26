#!/usr/bin/env python3
"""
Database Migration Script: Add Manual Player/Match Support

This script adds the necessary columns and sequences to support manually added
players and matches alongside external data, with zero collision risk.

Run this script once to update the database schema.
"""

import os
import sys
from dotenv import load_dotenv
import snowflake.connector
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

# Load environment variables
load_dotenv()

def get_snowflake_connection():
    """Get Snowflake connection using environment variables"""
    # Private key authentication (preferred)
    private_key_path = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")
    if private_key_path and os.path.exists(private_key_path):
        with open(private_key_path, "rb") as key:
            p_key = serialization.load_pem_private_key(
                key.read(),
                password=None,  # Assume no password for now
                backend=default_backend()
            )

        pkb = p_key.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption())

        return snowflake.connector.connect(
            account=os.getenv("SNOWFLAKE_ACCOUNT"),
            user=os.getenv("SNOWFLAKE_USERNAME"),
            private_key=pkb,
            warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
            database=os.getenv("SNOWFLAKE_DATABASE"),
            schema=os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC")
        )
    else:
        # Fallback to password authentication
        return snowflake.connector.connect(
            account=os.getenv("SNOWFLAKE_ACCOUNT"),
            user=os.getenv("SNOWFLAKE_USERNAME"),
            password=os.getenv("SNOWFLAKE_PASSWORD"),
            warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
            database=os.getenv("SNOWFLAKE_DATABASE"),
            schema=os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC")
        )

def run_migration():
    """Run the database migration"""
    conn = None
    try:
        print("🔄 Connecting to Snowflake...")
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        print("📊 Starting database migration for manual data support...")

        # 1. Add columns to players table
        print("1️⃣ Adding columns to players table...")

        # Check if columns already exist
        cursor.execute("DESCRIBE TABLE players")
        columns = cursor.fetchall()
        column_names = [col[0] for col in columns]

        if 'CAFC_PLAYER_ID' not in column_names:
            cursor.execute("ALTER TABLE players ADD COLUMN CAFC_PLAYER_ID INTEGER NULL")
            print("   ✅ Added CAFC_PLAYER_ID column")
        else:
            print("   ℹ️  CAFC_PLAYER_ID column already exists")

        if 'DATA_SOURCE' not in column_names:
            cursor.execute("ALTER TABLE players ADD COLUMN DATA_SOURCE VARCHAR(10) DEFAULT 'external'")
            print("   ✅ Added DATA_SOURCE column")
        else:
            print("   ℹ️  DATA_SOURCE column already exists")

        # 2. Add columns to matches table
        print("2️⃣ Adding columns to matches table...")

        cursor.execute("DESCRIBE TABLE matches")
        columns = cursor.fetchall()
        column_names = [col[0] for col in columns]

        if 'CAFC_MATCH_ID' not in column_names:
            cursor.execute("ALTER TABLE matches ADD COLUMN CAFC_MATCH_ID INTEGER NULL")
            print("   ✅ Added CAFC_MATCH_ID column")
        else:
            print("   ℹ️  CAFC_MATCH_ID column already exists")

        if 'DATA_SOURCE' not in column_names:
            cursor.execute("ALTER TABLE matches ADD COLUMN DATA_SOURCE VARCHAR(10) DEFAULT 'external'")
            print("   ✅ Added DATA_SOURCE column")
        else:
            print("   ℹ️  DATA_SOURCE column already exists")

        # 3. Create sequences for manual IDs
        print("3️⃣ Creating sequences for manual IDs...")

        try:
            cursor.execute("CREATE SEQUENCE IF NOT EXISTS manual_player_seq START = 1 INCREMENT = 1")
            print("   ✅ Created manual_player_seq sequence")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("   ℹ️  manual_player_seq sequence already exists")
            else:
                raise

        try:
            cursor.execute("CREATE SEQUENCE IF NOT EXISTS manual_match_seq START = 1 INCREMENT = 1")
            print("   ✅ Created manual_match_seq sequence")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("   ℹ️  manual_match_seq sequence already exists")
            else:
                raise

        # 4. Backfill existing data as external
        print("4️⃣ Backfilling existing data as external source...")

        cursor.execute("UPDATE players SET DATA_SOURCE = 'external' WHERE DATA_SOURCE IS NULL")
        players_updated = cursor.rowcount
        print(f"   ✅ Updated {players_updated} players to external source")

        cursor.execute("UPDATE matches SET DATA_SOURCE = 'external' WHERE DATA_SOURCE IS NULL")
        matches_updated = cursor.rowcount
        print(f"   ✅ Updated {matches_updated} matches to external source")

        # 5. Create helpful indexes
        print("5️⃣ Creating indexes for performance...")

        try:
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_players_data_source ON players (DATA_SOURCE)")
            print("   ✅ Created index on players.DATA_SOURCE")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("   ℹ️  Index on players.DATA_SOURCE already exists")
            else:
                print(f"   ⚠️  Could not create index on players.DATA_SOURCE: {e}")

        try:
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_players_cafc_id ON players (CAFC_PLAYER_ID)")
            print("   ✅ Created index on players.CAFC_PLAYER_ID")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("   ℹ️  Index on players.CAFC_PLAYER_ID already exists")
            else:
                print(f"   ⚠️  Could not create index on players.CAFC_PLAYER_ID: {e}")

        try:
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_matches_data_source ON matches (DATA_SOURCE)")
            print("   ✅ Created index on matches.DATA_SOURCE")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("   ℹ️  Index on matches.DATA_SOURCE already exists")
            else:
                print(f"   ⚠️  Could not create index on matches.DATA_SOURCE: {e}")

        try:
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_matches_cafc_id ON matches (CAFC_MATCH_ID)")
            print("   ✅ Created index on matches.CAFC_MATCH_ID")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("   ℹ️  Index on matches.CAFC_MATCH_ID already exists")
            else:
                print(f"   ⚠️  Could not create index on matches.CAFC_MATCH_ID: {e}")

        # Commit all changes
        conn.commit()

        # 6. Verify the migration
        print("6️⃣ Verifying migration...")

        cursor.execute("""
            SELECT
                DATA_SOURCE,
                COUNT(*) as total,
                COUNT(PLAYERID) as external_ids,
                COUNT(CAFC_PLAYER_ID) as manual_ids
            FROM players
            GROUP BY DATA_SOURCE
        """)

        print("   📊 Players table verification:")
        for row in cursor.fetchall():
            data_source, total, external_ids, manual_ids = row
            print(f"      {data_source}: {total} total, {external_ids} external IDs, {manual_ids} manual IDs")

        cursor.execute("""
            SELECT
                DATA_SOURCE,
                COUNT(*) as total,
                COUNT(ID) as external_ids,
                COUNT(CAFC_MATCH_ID) as manual_ids
            FROM matches
            GROUP BY DATA_SOURCE
        """)

        print("   📊 Matches table verification:")
        for row in cursor.fetchall():
            data_source, total, external_ids, manual_ids = row
            print(f"      {data_source}: {total} total, {external_ids} external IDs, {manual_ids} manual IDs")

        print("\n🎉 Migration completed successfully!")
        print("\n📝 Summary of changes:")
        print("   - Added CAFC_PLAYER_ID and DATA_SOURCE columns to players table")
        print("   - Added CAFC_MATCH_ID and DATA_SOURCE columns to matches table")
        print("   - Created sequences for manual player/match IDs")
        print("   - Backfilled existing data as 'external' source")
        print("   - Created performance indexes")
        print("\n✅ Your system now supports both external and manual players/matches with zero collision risk!")

    except Exception as e:
        print(f"❌ Migration failed: {e}")
        if conn:
            conn.rollback()
        sys.exit(1)

    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_migration()