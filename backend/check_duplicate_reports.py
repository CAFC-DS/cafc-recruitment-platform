"""
Check for duplicate scout reports in the database.
"""

import snowflake.connector
import os
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

load_dotenv()

# Snowflake connection parameters
SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT")
SNOWFLAKE_USER = os.getenv("SNOWFLAKE_USERNAME")
SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE")
SNOWFLAKE_DATABASE = os.getenv("SNOWFLAKE_DATABASE")
SNOWFLAKE_SCHEMA = os.getenv("SNOWFLAKE_SCHEMA")
SNOWFLAKE_PRIVATE_KEY_PATH = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")


def get_private_key():
    """Load private key from file for authentication."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    key_path = os.path.join(script_dir, SNOWFLAKE_PRIVATE_KEY_PATH)
    with open(key_path, "rb") as key:
        p_key = serialization.load_pem_private_key(
            key.read(),
            password=None,
            backend=default_backend()
        )
    return p_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


def get_snowflake_connection():
    """Create and return a Snowflake connection."""
    print("Connecting to Snowflake...")
    pkb = get_private_key()
    conn = snowflake.connector.connect(
        account=SNOWFLAKE_ACCOUNT,
        user=SNOWFLAKE_USER,
        warehouse=SNOWFLAKE_WAREHOUSE,
        database=SNOWFLAKE_DATABASE,
        schema=SNOWFLAKE_SCHEMA,
        private_key=pkb
    )
    print("✓ Connected to Snowflake\n")
    return conn


def main():
    conn = get_snowflake_connection()
    cursor = conn.cursor()

    print("=" * 80)
    print("CHECKING FOR DUPLICATE SCOUT REPORTS")
    print("=" * 80 + "\n")

    # Check for duplicate archived reports based on player, match, user, and created date
    query = """
        SELECT
            p.PLAYERNAME,
            COUNT(*) as report_count,
            sr.USER_ID,
            sr.MATCH_ID,
            DATE(sr.CREATED_AT) as report_date
        FROM SCOUT_REPORTS sr
        LEFT JOIN PLAYERS p ON (sr.PLAYER_ID = p.PLAYERID OR sr.CAFC_PLAYER_ID = p.CAFC_PLAYER_ID)
        WHERE sr.IS_ARCHIVED = TRUE
        GROUP BY p.PLAYERNAME, sr.USER_ID, sr.MATCH_ID, DATE(sr.CREATED_AT)
        HAVING COUNT(*) > 1
        ORDER BY report_count DESC, p.PLAYERNAME
        LIMIT 50
    """

    cursor.execute(query)
    duplicates = cursor.fetchall()

    if duplicates:
        print(f"Found {len(duplicates)} sets of duplicate reports:\n")
        print(f"{'Player':<30} {'Count':<10} {'User ID':<10} {'Match ID':<10} {'Date'}")
        print("-" * 80)
        for dup in duplicates:
            player_name = dup[0] or "Unknown"
            count = dup[1]
            user_id = dup[2]
            match_id = dup[3]
            report_date = dup[4]
            print(f"{player_name:<30} {count:<10} {user_id:<10} {match_id:<10} {report_date}")
    else:
        print("✓ No duplicates found!")

    # Also check total archived reports
    cursor.execute("SELECT COUNT(*) FROM SCOUT_REPORTS WHERE IS_ARCHIVED = TRUE")
    total = cursor.fetchone()[0]
    print(f"\nTotal archived reports: {total}")

    cursor.close()
    conn.close()


if __name__ == "__main__":
    main()
