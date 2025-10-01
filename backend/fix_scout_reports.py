#!/usr/bin/env python3
"""
Script to fix scout reports with empty match IDs by Dave Watson
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

def investigate_reports():
    """Investigate scout reports by Dave Watson with problematic match IDs"""
    conn = get_snowflake_connection()
    cursor = conn.cursor()

    try:
        print("=== Investigating Scout Reports Database ===\n")

        # First, let's see all users to understand the naming patterns
        print("0. Finding all users in the database:")
        cursor.execute("""
            SELECT DISTINCT USERNAME
            FROM users
            ORDER BY USERNAME
        """)

        all_users = cursor.fetchall()
        print(f"Found {len(all_users)} users:")
        for user in all_users:
            print(f"  - {user[0]}")

        print("\n" + "="*60 + "\n")

        # Find reports by Dave Watson (broader search)
        print("1. Finding all reports by Dave Watson (broader search):")
        cursor.execute("""
            SELECT
                sr.ID,
                sr.MATCH_ID,
                COALESCE(p.PLAYERNAME, 'Unknown') as player_name,
                sr.CREATED_AT,
                m.HOMESQUADNAME,
                m.AWAYSQUADNAME,
                m.SCHEDULEDDATE,
                u.USERNAME
            FROM scout_reports sr
            JOIN users u ON sr.USER_ID = u.ID
            LEFT JOIN players p ON (
                (sr.PLAYER_ID = p.PLAYERID AND p.DATA_SOURCE = 'external') OR
                (sr.CAFC_PLAYER_ID = p.CAFC_PLAYER_ID AND p.DATA_SOURCE = 'internal')
            )
            LEFT JOIN matches m ON (sr.MATCH_ID = m.ID OR sr.MATCH_ID = m.CAFC_MATCH_ID)
            WHERE u.USERNAME ILIKE '%Dave%' OR u.USERNAME ILIKE '%Watson%'
            ORDER BY sr.CREATED_AT DESC
        """)

        dave_reports = cursor.fetchall()
        print(f"Found {len(dave_reports)} reports by Dave Watson")

        for report in dave_reports:
            print(f"  Report ID: {report[0]}, Match ID: {report[1]}, Player: {report[2]}")
            print(f"    Date: {report[3]}, Home: {report[4]}, Away: {report[5]}, User: {report[7]}")

        print("\n" + "="*60 + "\n")

        # Check for empty/null matches
        print("2. Checking for matches with empty fixture details:")
        cursor.execute("""
            SELECT DISTINCT
                m.ID as match_id,
                m.HOMESQUADNAME,
                m.AWAYSQUADNAME,
                m.SCHEDULEDDATE,
                COUNT(sr.ID) as report_count
            FROM matches m
            LEFT JOIN scout_reports sr ON (m.ID = sr.MATCH_ID OR m.CAFC_MATCH_ID = sr.MATCH_ID)
            WHERE m.HOMESQUADNAME IS NULL OR m.AWAYSQUADNAME IS NULL
               OR TRIM(m.HOMESQUADNAME) = '' OR TRIM(m.AWAYSQUADNAME) = ''
            GROUP BY m.ID, m.HOMESQUADNAME, m.AWAYSQUADNAME, m.SCHEDULEDDATE
            ORDER BY report_count DESC
        """)

        empty_matches = cursor.fetchall()
        print(f"Found {len(empty_matches)} matches with empty details:")

        for match in empty_matches:
            print(f"  Match ID: {match[0]}, Home: {match[1]}, Away: {match[2]}")
            print(f"    Date: {match[3]}, Reports: {match[4]}")

        print("\n" + "="*60 + "\n")

        # Find Leeds United U21 vs Sporting CP B match
        print("3. Finding Leeds United U21 vs Sporting CP B match:")
        cursor.execute("""
            SELECT
                ID,
                HOMESQUADNAME,
                AWAYSQUADNAME,
                SCHEDULEDDATE,
                CAFC_MATCH_ID
            FROM matches
            WHERE (HOMESQUADNAME ILIKE '%Leeds%U21%' AND AWAYSQUADNAME ILIKE '%Sporting%CP%B%')
               OR (AWAYSQUADNAME ILIKE '%Leeds%U21%' AND HOMESQUADNAME ILIKE '%Sporting%CP%B%')
               OR (HOMESQUADNAME ILIKE '%Leeds%' AND AWAYSQUADNAME ILIKE '%Sporting%')
               OR (AWAYSQUADNAME ILIKE '%Leeds%' AND HOMESQUADNAME ILIKE '%Sporting%')
            ORDER BY SCHEDULEDDATE DESC
        """)

        target_matches = cursor.fetchall()
        print(f"Found {len(target_matches)} potential target matches:")

        for match in target_matches:
            print(f"  Match ID: {match[0]}, Home: {match[1]}, Away: {match[2]}")
            print(f"    Date: {match[3]}, CAFC_MATCH_ID: {match[4]}")

        print("\n" + "="*60 + "\n")

        # Show ALL reports with problematic match IDs
        print("4. ALL reports with potentially problematic match IDs:")
        cursor.execute("""
            SELECT
                sr.ID,
                sr.MATCH_ID,
                COALESCE(p.PLAYERNAME, 'Unknown') as player_name,
                sr.CREATED_AT,
                m.HOMESQUADNAME,
                m.AWAYSQUADNAME,
                u.USERNAME
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

        for report in problematic_reports:
            print(f"  Report ID: {report[0]}, Match ID: {report[1]}, Player: {report[2]}")
            print(f"    Date: {report[3]}, Match Home: {report[4]}, Away: {report[5]}, User: {report[6]}")

        return dave_reports, empty_matches, target_matches, problematic_reports

    except Exception as e:
        print(f"Error investigating reports: {e}")
        return [], [], [], []
    finally:
        cursor.close()
        conn.close()

def fix_reports(problematic_report_ids, target_match_id):
    """Fix the problematic reports by updating their match ID"""
    if not problematic_report_ids or not target_match_id:
        print("No reports to fix or no target match ID provided")
        return False

    conn = get_snowflake_connection()
    cursor = conn.cursor()

    try:
        print(f"\n=== Fixing {len(problematic_report_ids)} scout reports ===")
        print(f"Updating reports {problematic_report_ids} to use match ID: {target_match_id}")

        # Convert list to comma-separated string for SQL IN clause
        report_ids_str = ','.join(map(str, problematic_report_ids))

        # Update the reports
        update_query = f"""
            UPDATE scout_reports
            SET MATCH_ID = {target_match_id}
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
        print("\nVerifying updates:")
        cursor.execute(f"""
            SELECT
                sr.REPORT_ID,
                sr.MATCH_ID,
                sr.PLAYER_NAME,
                m.HOME_TEAM,
                m.AWAY_TEAM,
                m.FIXTURE_DETAILS
            FROM scout_reports sr
            JOIN matches m ON sr.MATCH_ID = m.MATCH_ID
            WHERE sr.REPORT_ID IN ({report_ids_str})
        """)

        updated_reports = cursor.fetchall()
        for report in updated_reports:
            print(f"  Report ID: {report[0]}, Match ID: {report[1]}, Player: {report[2]}")
            print(f"    Match: {report[3]} vs {report[4]} - {report[5]}")

        return True

    except Exception as e:
        print(f"Error fixing reports: {e}")
        conn.rollback()
        return False
    finally:
        cursor.close()
        conn.close()

def main():
    """Main function to investigate and fix scout reports"""
    print("Scout Reports Fix Tool")
    print("=====================\n")

    # Step 1: Investigate the current state
    dave_reports, empty_matches, target_matches, problematic_reports = investigate_reports()

    if not problematic_reports:
        print("No problematic reports found by Dave Watson.")
        return

    if not target_matches:
        print("Could not find Leeds United U21 vs Sporting CP B match.")
        print("Please check the match exists in the database with the correct team names.")
        return

    # Show what we found
    print(f"\nSummary:")
    print(f"- Found {len(problematic_reports)} reports by Dave Watson with empty/invalid match data")
    print(f"- Found {len(target_matches)} potential target matches")

    if len(target_matches) == 1:
        target_match_id = target_matches[0][0]
        print(f"- Will use match ID {target_match_id}: {target_matches[0][4]}")

        # Get the report IDs that need fixing
        problematic_report_ids = [report[0] for report in problematic_reports]

        # Ask for confirmation
        response = input(f"\nDo you want to update {len(problematic_report_ids)} reports to use match ID {target_match_id}? (y/N): ")

        if response.lower() == 'y':
            success = fix_reports(problematic_report_ids, target_match_id)
            if success:
                print("\n✅ Scout reports successfully updated!")
            else:
                print("\n❌ Failed to update scout reports.")
        else:
            print("Operation cancelled.")
    else:
        print(f"- Multiple target matches found. Please review and specify which one to use:")
        for i, match in enumerate(target_matches):
            print(f"  {i+1}. Match ID {match[0]}: {match[1]} vs {match[2]} - {match[4]}")

if __name__ == "__main__":
    main()