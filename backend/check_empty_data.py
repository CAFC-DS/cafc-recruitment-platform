#!/usr/bin/env python3
"""
Script to check for any remaining empty scout reports or matches
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

def check_empty_data():
    """Check for any remaining empty scout reports or matches"""
    conn = get_snowflake_connection()
    cursor = conn.cursor()

    try:
        print("=== Checking for Empty Data ===\n")

        # 1. Check for scout reports with empty/null summaries
        print("1. Checking for scout reports with empty summaries:")
        cursor.execute("""
            SELECT COUNT(*) as empty_reports_count
            FROM scout_reports
            WHERE SUMMARY IS NULL
               OR TRIM(SUMMARY) = ''
               OR SUMMARY = 'null'
        """)

        empty_reports = cursor.fetchone()
        empty_reports_count = empty_reports[0] if empty_reports else 0
        print(f"   Found {empty_reports_count} scout reports with empty summaries")

        if empty_reports_count > 0:
            # Show details of empty reports
            cursor.execute("""
                SELECT sr.ID, u.USERNAME, sr.CREATED_AT, sr.SUMMARY
                FROM scout_reports sr
                JOIN users u ON sr.USER_ID = u.ID
                WHERE SUMMARY IS NULL
                   OR TRIM(SUMMARY) = ''
                   OR SUMMARY = 'null'
                ORDER BY sr.CREATED_AT DESC
                LIMIT 10
            """)

            empty_report_details = cursor.fetchall()
            print("   Sample empty reports:")
            for report in empty_report_details:
                print(f"     Report ID: {report[0]}, User: {report[1]}, Date: {report[2]}, Summary: '{report[3]}'")

        # 2. Check for scout reports pointing to non-existent matches
        print("\n2. Checking for scout reports pointing to non-existent matches:")
        cursor.execute("""
            SELECT COUNT(*) as orphaned_reports_count
            FROM scout_reports sr
            WHERE NOT EXISTS (
                SELECT 1 FROM matches m
                WHERE m.ID = sr.MATCH_ID OR m.CAFC_MATCH_ID = sr.MATCH_ID
            )
        """)

        orphaned_reports = cursor.fetchone()
        orphaned_reports_count = orphaned_reports[0] if orphaned_reports else 0
        print(f"   Found {orphaned_reports_count} scout reports pointing to non-existent matches")

        if orphaned_reports_count > 0:
            # Show details of orphaned reports
            cursor.execute("""
                SELECT sr.ID, sr.MATCH_ID, u.USERNAME, sr.CREATED_AT
                FROM scout_reports sr
                JOIN users u ON sr.USER_ID = u.ID
                WHERE NOT EXISTS (
                    SELECT 1 FROM matches m
                    WHERE m.ID = sr.MATCH_ID OR m.CAFC_MATCH_ID = sr.MATCH_ID
                )
                ORDER BY sr.CREATED_AT DESC
                LIMIT 10
            """)

            orphaned_report_details = cursor.fetchall()
            print("   Sample orphaned reports:")
            for report in orphaned_report_details:
                print(f"     Report ID: {report[0]}, Match ID: {report[1]}, User: {report[2]}, Date: {report[3]}")

        # 3. Check for matches with empty team names
        print("\n3. Checking for matches with empty team names:")
        cursor.execute("""
            SELECT COUNT(*) as empty_matches_count
            FROM matches
            WHERE (HOMESQUADNAME IS NULL OR TRIM(HOMESQUADNAME) = '')
               OR (AWAYSQUADNAME IS NULL OR TRIM(AWAYSQUADNAME) = '')
        """)

        empty_matches = cursor.fetchone()
        empty_matches_count = empty_matches[0] if empty_matches else 0
        print(f"   Found {empty_matches_count} matches with empty team names")

        if empty_matches_count > 0:
            # Show details of empty matches
            cursor.execute("""
                SELECT ID, CAFC_MATCH_ID, HOMESQUADNAME, AWAYSQUADNAME, SCHEDULEDDATE
                FROM matches
                WHERE (HOMESQUADNAME IS NULL OR TRIM(HOMESQUADNAME) = '')
                   OR (AWAYSQUADNAME IS NULL OR TRIM(AWAYSQUADNAME) = '')
                ORDER BY SCHEDULEDDATE DESC
                LIMIT 10
            """)

            empty_match_details = cursor.fetchall()
            print("   Sample empty matches:")
            for match in empty_match_details:
                print(f"     Match ID: {match[0]} (CAFC: {match[1]}), Home: '{match[2]}', Away: '{match[3]}', Date: {match[4]}")

        # 4. Check for scout reports with empty match data (our previous issue)
        print("\n4. Checking for scout reports with empty match data:")
        cursor.execute("""
            SELECT COUNT(*) as problematic_reports_count
            FROM scout_reports sr
            LEFT JOIN matches m ON (sr.MATCH_ID = m.ID OR sr.MATCH_ID = m.CAFC_MATCH_ID)
            WHERE (m.ID IS NULL
                   OR m.HOMESQUADNAME IS NULL
                   OR m.AWAYSQUADNAME IS NULL
                   OR TRIM(m.HOMESQUADNAME) = ''
                   OR TRIM(m.AWAYSQUADNAME) = '')
        """)

        problematic_reports = cursor.fetchone()
        problematic_reports_count = problematic_reports[0] if problematic_reports else 0
        print(f"   Found {problematic_reports_count} scout reports with empty match data")

        # 5. Check for scout reports with null/empty player references
        print("\n5. Checking for scout reports with null/empty player references:")
        cursor.execute("""
            SELECT COUNT(*) as null_player_reports_count
            FROM scout_reports
            WHERE (PLAYER_ID IS NULL OR PLAYER_ID = 0)
               AND (CAFC_PLAYER_ID IS NULL OR CAFC_PLAYER_ID = 0)
        """)

        null_player_reports = cursor.fetchone()
        null_player_reports_count = null_player_reports[0] if null_player_reports else 0
        print(f"   Found {null_player_reports_count} scout reports with null/empty player references")

        # Summary
        print("\n" + "="*60)
        print("SUMMARY:")
        print("="*60)

        total_issues = (empty_reports_count + orphaned_reports_count +
                       empty_matches_count + problematic_reports_count +
                       null_player_reports_count)

        if total_issues == 0:
            print("✅ No empty or problematic data found! Database is clean.")
        else:
            print(f"⚠️  Found {total_issues} total data issues:")
            if empty_reports_count > 0:
                print(f"   • {empty_reports_count} scout reports with empty summaries")
            if orphaned_reports_count > 0:
                print(f"   • {orphaned_reports_count} scout reports pointing to non-existent matches")
            if empty_matches_count > 0:
                print(f"   • {empty_matches_count} matches with empty team names")
            if problematic_reports_count > 0:
                print(f"   • {problematic_reports_count} scout reports with empty match data")
            if null_player_reports_count > 0:
                print(f"   • {null_player_reports_count} scout reports with null player references")

        return total_issues

    except Exception as e:
        print(f"Error checking data: {e}")
        return -1
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    check_empty_data()