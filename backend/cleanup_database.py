#!/usr/bin/env python3
"""
Script to clean up database:
1. Analyze reports with empty match IDs and identify users
2. Delete all scout reports from testuser
3. Delete matches with null home and away teams
"""

import snowflake.connector
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def get_snowflake_connection():
    """Create and return a Snowflake connection using the same method as main.py"""
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import serialization

    # Get environment variables using the same names as main.py
    SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT")
    SNOWFLAKE_USERNAME = os.getenv("SNOWFLAKE_USERNAME")
    SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE")
    SNOWFLAKE_DATABASE = os.getenv("SNOWFLAKE_DATABASE")
    SNOWFLAKE_SCHEMA = os.getenv("SNOWFLAKE_SCHEMA")
    SNOWFLAKE_PRIVATE_KEY_PATH = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")
    ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

    # Get private key (same method as main.py)
    def get_private_key():
        if ENVIRONMENT == "production":
            private_key_content = os.getenv("SNOWFLAKE_PRIVATE_KEY")
            if not private_key_content:
                raise Exception("SNOWFLAKE_PRIVATE_KEY environment variable not set")
            p_key = serialization.load_pem_private_key(
                private_key_content.encode("utf-8"),
                password=None,
                backend=default_backend(),
            )
        else:
            # In development, use file
            with open(SNOWFLAKE_PRIVATE_KEY_PATH, "rb") as key:
                p_key = serialization.load_pem_private_key(
                    key.read(), password=None, backend=default_backend()
                )

        return p_key.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )

    try:
        pkb = get_private_key()

        connect_params = {
            "user": SNOWFLAKE_USERNAME,
            "account": SNOWFLAKE_ACCOUNT,
            "warehouse": SNOWFLAKE_WAREHOUSE,
            "database": SNOWFLAKE_DATABASE,
            "schema": SNOWFLAKE_SCHEMA,
            "private_key": pkb,
            "client_session_keep_alive": True,
            "client_session_keep_alive_heartbeat_frequency": 3600,
            "network_timeout": 60,
        }

        # SSL configuration for development
        if ENVIRONMENT == "development":
            connect_params["insecure_mode"] = True

        return snowflake.connector.connect(**connect_params)
    except Exception as e:
        print(f"Snowflake connection error: {e}")
        raise

def analyze_problematic_reports():
    """Analyze reports with empty match IDs and identify users"""
    conn = get_snowflake_connection()
    cursor = conn.cursor()

    try:
        print("=== Analyzing Reports with Empty Match IDs ===\n")

        # Find all reports pointing to matches with empty home/away teams
        print("1. Finding reports with match IDs pointing to empty matches:")
        cursor.execute("""
            SELECT
                COUNT(*) as report_count,
                u.USERNAME,
                sr.MATCH_ID,
                m.HOMESQUADNAME,
                m.AWAYSQUADNAME
            FROM scout_reports sr
            JOIN users u ON sr.USER_ID = u.ID
            LEFT JOIN matches m ON (sr.MATCH_ID = m.ID OR sr.MATCH_ID = m.CAFC_MATCH_ID)
            WHERE (m.ID IS NULL
                   OR m.HOMESQUADNAME IS NULL
                   OR m.AWAYSQUADNAME IS NULL
                   OR TRIM(m.HOMESQUADNAME) = ''
                   OR TRIM(m.AWAYSQUADNAME) = '')
            GROUP BY u.USERNAME, sr.MATCH_ID, m.HOMESQUADNAME, m.AWAYSQUADNAME
            ORDER BY report_count DESC, u.USERNAME
        """)

        problematic_reports = cursor.fetchall()

        total_problematic = sum(report[0] for report in problematic_reports)
        print(f"Found {total_problematic} total reports with empty match details:")
        print()

        for report in problematic_reports:
            print(f"  User: {report[1]} - {report[0]} reports")
            print(f"    Match ID: {report[2]}, Home: {report[3]}, Away: {report[4]}")
            print()

        return problematic_reports

    except Exception as e:
        print(f"Error analyzing reports: {e}")
        return []
    finally:
        cursor.close()
        conn.close()

def delete_testuser_reports():
    """Delete all scout reports from testuser"""
    conn = get_snowflake_connection()
    cursor = conn.cursor()

    try:
        print("=== Deleting TestUser Reports ===\n")

        # First, count how many reports testuser has
        print("1. Counting testuser reports:")
        cursor.execute("""
            SELECT COUNT(*) as report_count
            FROM scout_reports sr
            JOIN users u ON sr.USER_ID = u.ID
            WHERE u.USERNAME = 'testuser'
        """)

        count_result = cursor.fetchone()
        testuser_count = count_result[0] if count_result else 0
        print(f"Found {testuser_count} reports by testuser")

        if testuser_count == 0:
            print("No testuser reports to delete.")
            return

        # Delete the reports
        print(f"2. Deleting {testuser_count} testuser reports...")
        cursor.execute("""
            DELETE FROM scout_reports
            WHERE USER_ID IN (
                SELECT ID FROM users WHERE USERNAME = 'testuser'
            )
        """)

        affected_rows = cursor.rowcount
        print(f"Successfully deleted {affected_rows} scout reports by testuser")

        # Commit the changes
        conn.commit()
        print("Changes committed to database")

        return True

    except Exception as e:
        print(f"Error deleting testuser reports: {e}")
        conn.rollback()
        return False
    finally:
        cursor.close()
        conn.close()

def delete_empty_matches():
    """Delete matches with null home and away teams"""
    conn = get_snowflake_connection()
    cursor = conn.cursor()

    try:
        print("\n=== Deleting Empty Matches ===\n")

        # First, count how many empty matches exist
        print("1. Counting matches with null home and away teams:")
        cursor.execute("""
            SELECT COUNT(*) as match_count
            FROM matches
            WHERE (HOMESQUADNAME IS NULL OR TRIM(HOMESQUADNAME) = '')
               AND (AWAYSQUADNAME IS NULL OR TRIM(AWAYSQUADNAME) = '')
        """)

        count_result = cursor.fetchone()
        empty_count = count_result[0] if count_result else 0
        print(f"Found {empty_count} matches with empty home and away teams")

        if empty_count == 0:
            print("No empty matches to delete.")
            return

        # Show which match IDs will be deleted
        print("2. Identifying match IDs to be deleted:")
        cursor.execute("""
            SELECT ID, CAFC_MATCH_ID, SCHEDULEDDATE
            FROM matches
            WHERE (HOMESQUADNAME IS NULL OR TRIM(HOMESQUADNAME) = '')
               AND (AWAYSQUADNAME IS NULL OR TRIM(AWAYSQUADNAME) = '')
        """)

        empty_matches = cursor.fetchall()
        for match in empty_matches:
            print(f"  Match ID: {match[0]}, CAFC_MATCH_ID: {match[1]}, Date: {match[2]}")

        # Delete the empty matches
        print(f"\n3. Deleting {empty_count} empty matches...")
        cursor.execute("""
            DELETE FROM matches
            WHERE (HOMESQUADNAME IS NULL OR TRIM(HOMESQUADNAME) = '')
               AND (AWAYSQUADNAME IS NULL OR TRIM(AWAYSQUADNAME) = '')
        """)

        affected_rows = cursor.rowcount
        print(f"Successfully deleted {affected_rows} empty matches")

        # Commit the changes
        conn.commit()
        print("Changes committed to database")

        return True

    except Exception as e:
        print(f"Error deleting empty matches: {e}")
        conn.rollback()
        return False
    finally:
        cursor.close()
        conn.close()

def main():
    """Main function to analyze and clean up the database"""
    print("Database Cleanup Tool")
    print("===================\n")

    # Step 1: Analyze problematic reports
    print("STEP 1: Analysis")
    print("================")
    problematic_reports = analyze_problematic_reports()

    # Step 2: Delete testuser reports
    print("\nSTEP 2: Cleanup")
    print("===============")
    delete_testuser_reports()

    # Step 3: Delete empty matches
    delete_empty_matches()

    print("\n✅ Database cleanup completed!")
    print("\nSummary:")

    total_problematic = sum(report[0] for report in problematic_reports)
    if total_problematic > 0:
        print(f"- Found {total_problematic} reports with empty match details from:")
        user_summary = {}
        for report in problematic_reports:
            user = report[1]
            count = report[0]
            user_summary[user] = user_summary.get(user, 0) + count

        for user, count in user_summary.items():
            print(f"  • {user}: {count} reports")
    else:
        print("- No reports with empty match details found")

if __name__ == "__main__":
    main()