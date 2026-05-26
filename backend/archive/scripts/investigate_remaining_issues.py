#!/usr/bin/env python3
"""
Script to investigate the 11 remaining scout reports with empty match data
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

def investigate_remaining_issues():
    """Investigate the 11 remaining scout reports with empty match data"""
    conn = get_snowflake_connection()
    cursor = conn.cursor()

    try:
        print("=== Investigating Remaining Issues ===\n")

        # Get detailed information about the 11 problematic reports
        print("1. Finding all scout reports with empty match data:")
        cursor.execute("""
            SELECT
                sr.ID,
                sr.MATCH_ID,
                u.USERNAME,
                sr.CREATED_AT,
                COALESCE(p.PLAYERNAME, 'Unknown') as player_name,
                m.ID as actual_match_id,
                m.CAFC_MATCH_ID,
                m.HOMESQUADNAME,
                m.AWAYSQUADNAME,
                m.SCHEDULEDDATE
            FROM scout_reports sr
            JOIN users u ON sr.USER_ID = u.ID
            LEFT JOIN players p ON (
                (sr.PLAYER_ID = p.PLAYERID AND p.DATA_SOURCE = 'external') OR
                (sr.CAFC_PLAYER_ID = p.CAFC_PLAYER_ID AND p.DATA_SOURCE = 'internal')
            )
            LEFT JOIN matches m ON (sr.MATCH_ID = m.ID OR sr.MATCH_ID = m.CAFC_MATCH_ID)
            WHERE (m.ID IS NULL
                   OR m.HOMESQUADNAME IS NULL
                   OR m.AWAYSQUADNAME IS NULL
                   OR TRIM(m.HOMESQUADNAME) = ''
                   OR TRIM(m.AWAYSQUADNAME) = '')
            ORDER BY u.USERNAME, sr.CREATED_AT DESC
        """)

        problematic_reports = cursor.fetchall()
        print(f"Found {len(problematic_reports)} problematic reports:")

        user_summary = {}
        for report in problematic_reports:
            user = report[2]
            user_summary[user] = user_summary.get(user, 0) + 1

            print(f"\nReport ID: {report[0]}")
            print(f"  Match ID: {report[1]}")
            print(f"  User: {report[2]}")
            print(f"  Player: {report[4]}")
            print(f"  Date: {report[3]}")
            print(f"  Actual Match ID: {report[5]}")
            print(f"  CAFC Match ID: {report[6]}")
            print(f"  Home Team: '{report[7]}'")
            print(f"  Away Team: '{report[8]}'")
            print(f"  Match Date: {report[9]}")

        print(f"\n" + "="*60)
        print("SUMMARY BY USER:")
        for user, count in user_summary.items():
            print(f"  {user}: {count} problematic reports")

        # Check if these match IDs exist in the matches table
        print(f"\n" + "="*60)
        print("2. Checking if the match IDs exist in matches table:")

        unique_match_ids = set()
        for report in problematic_reports:
            if report[1]:  # if MATCH_ID is not null
                unique_match_ids.add(report[1])

        for match_id in unique_match_ids:
            print(f"\nChecking Match ID {match_id}:")

            # Check by ID
            cursor.execute(f"SELECT ID, HOMESQUADNAME, AWAYSQUADNAME FROM matches WHERE ID = {match_id}")
            id_result = cursor.fetchall()

            # Check by CAFC_MATCH_ID
            cursor.execute(f"SELECT ID, HOMESQUADNAME, AWAYSQUADNAME FROM matches WHERE CAFC_MATCH_ID = {match_id}")
            cafc_result = cursor.fetchall()

            print(f"  Found by ID: {len(id_result)} matches")
            for match in id_result:
                print(f"    ID: {match[0]}, Home: '{match[1]}', Away: '{match[2]}'")

            print(f"  Found by CAFC_MATCH_ID: {len(cafc_result)} matches")
            for match in cafc_result:
                print(f"    ID: {match[0]}, Home: '{match[1]}', Away: '{match[2]}'")

        return problematic_reports

    except Exception as e:
        print(f"Error investigating: {e}")
        return []
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    investigate_remaining_issues()