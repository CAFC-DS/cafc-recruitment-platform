"""
Database Migration: Add IS_ARCHIVED column to SCOUT_REPORTS table

This script adds a new IS_ARCHIVED boolean column to mark historical/archived reports.
Archived reports are excluded from analytics calculations.

Usage:
    python run_migration_add_is_archived.py
"""

import snowflake.connector
import os
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

# Load environment variables
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


def check_column_exists(cursor):
    """Check if IS_ARCHIVED column already exists."""
    query = """
        SELECT COUNT(*)
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'SCOUT_REPORTS'
        AND COLUMN_NAME = 'IS_ARCHIVED'
    """
    cursor.execute(query)
    result = cursor.fetchone()
    return result[0] > 0


def add_is_archived_column(cursor):
    """Add IS_ARCHIVED column to SCOUT_REPORTS table."""
    print("Adding IS_ARCHIVED column to SCOUT_REPORTS table...")

    query = """
        ALTER TABLE SCOUT_REPORTS
        ADD COLUMN IS_ARCHIVED BOOLEAN DEFAULT FALSE
    """

    cursor.execute(query)
    print("✓ IS_ARCHIVED column added successfully\n")


def verify_migration(cursor):
    """Verify the migration was successful."""
    print("Verifying migration...")

    # Check column details
    query = """
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'SCOUT_REPORTS' AND COLUMN_NAME = 'IS_ARCHIVED'
    """
    cursor.execute(query)
    result = cursor.fetchone()

    if result:
        print(f"✓ Column details:")
        print(f"  Name: {result[0]}")
        print(f"  Type: {result[1]}")
        print(f"  Nullable: {result[2]}")
        print(f"  Default: {result[3]}\n")

    # Check report counts
    query = """
        SELECT
            COUNT(*) as total_reports,
            SUM(CASE WHEN IS_ARCHIVED = TRUE THEN 1 ELSE 0 END) as archived_reports,
            SUM(CASE WHEN IS_ARCHIVED = FALSE OR IS_ARCHIVED IS NULL THEN 1 ELSE 0 END) as active_reports
        FROM SCOUT_REPORTS
    """
    cursor.execute(query)
    result = cursor.fetchone()

    if result:
        print(f"✓ Report counts:")
        print(f"  Total reports: {result[0]}")
        print(f"  Archived reports: {result[1]}")
        print(f"  Active reports: {result[2]}\n")


def main():
    """Main function to run the migration."""
    print("="*80)
    print("DATABASE MIGRATION: Add IS_ARCHIVED column")
    print("="*80 + "\n")

    try:
        # Connect to database
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        # Check if column already exists
        if check_column_exists(cursor):
            print("⚠ IS_ARCHIVED column already exists!")
            print("  Migration has already been run. Skipping...\n")
        else:
            # Add the column
            add_is_archived_column(cursor)

            # Commit the changes
            conn.commit()

        # Verify the migration
        verify_migration(cursor)

        print("="*80)
        print("✓ MIGRATION COMPLETED SUCCESSFULLY")
        print("="*80)

        # Close connection
        cursor.close()
        conn.close()

    except Exception as e:
        print(f"\n✗ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
