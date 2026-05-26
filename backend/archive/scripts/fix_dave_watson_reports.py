#!/usr/bin/env python3
"""
Script to fix Dave Watson scout reports with Match ID 501 (empty match details)
and update them to use Match ID 601 (Leeds United U21 vs Sporting CP B)
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

def fix_dave_watson_reports():
    """Fix Dave Watson scout reports with Match ID 501 to use Match ID 601"""
    conn = get_snowflake_connection()
    cursor = conn.cursor()

    try:
        print("=== Fixing Dave Watson Scout Reports ===\n")

        # First, identify the problematic reports by Dave Watson with Match ID 501
        print("1. Finding Dave Watson reports with Match ID 501:")
        cursor.execute("""
            SELECT sr.ID, sr.MATCH_ID, COALESCE(p.PLAYERNAME, 'Unknown') as player_name
            FROM scout_reports sr
            JOIN users u ON sr.USER_ID = u.ID
            LEFT JOIN players p ON (
                (sr.PLAYER_ID = p.PLAYERID AND p.DATA_SOURCE = 'external') OR
                (sr.CAFC_PLAYER_ID = p.CAFC_PLAYER_ID AND p.DATA_SOURCE = 'internal')
            )
            WHERE u.USERNAME = 'dwatson' AND sr.MATCH_ID = 501
        """)

        problematic_reports = cursor.fetchall()
        print(f"Found {len(problematic_reports)} reports by Dave Watson with Match ID 501:")

        report_ids = []
        for report in problematic_reports:
            print(f"  Report ID: {report[0]}, Match ID: {report[1]}, Player: {report[2]}")
            report_ids.append(report[0])

        if not report_ids:
            print("No problematic reports found. Exiting.")
            return

        print(f"\n2. Updating {len(report_ids)} reports from Match ID 501 to Match ID 601...")

        # Convert list to comma-separated string for SQL IN clause
        report_ids_str = ','.join(map(str, report_ids))

        # Update the reports
        update_query = f"""
            UPDATE scout_reports
            SET MATCH_ID = 601
            WHERE ID IN ({report_ids_str})
        """

        print(f"Executing query: {update_query}")
        cursor.execute(update_query)

        affected_rows = cursor.rowcount
        print(f"Successfully updated {affected_rows} scout reports")

        # Commit the changes
        conn.commit()
        print("Changes committed to database")

        # Verify the updates
        print("\n3. Verifying updates:")
        cursor.execute(f"""
            SELECT
                sr.ID,
                sr.MATCH_ID,
                COALESCE(p.PLAYERNAME, 'Unknown') as player_name,
                m.HOMESQUADNAME,
                m.AWAYSQUADNAME
            FROM scout_reports sr
            LEFT JOIN players p ON (
                (sr.PLAYER_ID = p.PLAYERID AND p.DATA_SOURCE = 'external') OR
                (sr.CAFC_PLAYER_ID = p.CAFC_PLAYER_ID AND p.DATA_SOURCE = 'internal')
            )
            LEFT JOIN matches m ON sr.MATCH_ID = m.CAFC_MATCH_ID
            WHERE sr.ID IN ({report_ids_str})
        """)

        updated_reports = cursor.fetchall()
        for report in updated_reports:
            print(f"  Report ID: {report[0]}, Match ID: {report[1]}, Player: {report[2]}")
            print(f"    Match: {report[3]} vs {report[4]}")

        print(f"\n✅ Successfully fixed {len(report_ids)} Dave Watson scout reports!")
        print("All reports now point to the Leeds United U21 vs Sporting CP B match.")

        return True

    except Exception as e:
        print(f"Error fixing reports: {e}")
        conn.rollback()
        return False
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    fix_dave_watson_reports()