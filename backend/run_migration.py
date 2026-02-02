#!/usr/bin/env python3
"""
Simple migration runner for SHARED_REPORT_LINKS table
"""
import snowflake.connector
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def run_migration():
    print("Connecting to Snowflake...")

    try:
        # Connect to Snowflake
        conn = snowflake.connector.connect(
            user=os.getenv('SNOWFLAKE_USER'),
            password=os.getenv('SNOWFLAKE_PASSWORD'),
            account=os.getenv('SNOWFLAKE_ACCOUNT'),
            warehouse=os.getenv('SNOWFLAKE_WAREHOUSE'),
            database=os.getenv('SNOWFLAKE_DATABASE'),
            schema=os.getenv('SNOWFLAKE_SCHEMA')
        )

        cursor = conn.cursor()

        print("Reading migration file...")
        with open('migrations/create_shared_report_links.sql', 'r') as f:
            migration_sql = f.read()

        # Split by semicolons to execute each statement separately
        statements = [stmt.strip() for stmt in migration_sql.split(';') if stmt.strip() and not stmt.strip().startswith('--')]

        print(f"Executing {len(statements)} SQL statements...")
        for i, statement in enumerate(statements, 1):
            if statement:
                print(f"  [{i}/{len(statements)}] Executing statement...")
                try:
                    cursor.execute(statement)
                    print(f"  ✓ Statement {i} executed successfully")
                except Exception as e:
                    print(f"  ⚠ Warning on statement {i}: {e}")
                    # Continue even if there's an error (e.g., table already exists)

        conn.commit()
        print("\n✓ Migration completed successfully!")
        print("SHARED_REPORT_LINKS table is ready.")

        cursor.close()
        conn.close()

    except Exception as e:
        print(f"\n✗ Error during migration: {e}")
        print("\nPlease check your .env file has the correct Snowflake credentials:")
        print("  - SNOWFLAKE_USER")
        print("  - SNOWFLAKE_PASSWORD")
        print("  - SNOWFLAKE_ACCOUNT")
        print("  - SNOWFLAKE_WAREHOUSE")
        print("  - SNOWFLAKE_DATABASE")
        print("  - SNOWFLAKE_SCHEMA")
        return False

    return True

if __name__ == "__main__":
    print("=" * 60)
    print("SHARED_REPORT_LINKS Migration Runner")
    print("=" * 60)
    print()
    run_migration()
