#!/usr/bin/env python3
"""
Proper verification script to check if all scout reports have valid match references.
This handles both external matches (ID) and internal matches (CAFC_MATCH_ID).
"""

import os
from dotenv import load_dotenv
import snowflake.connector
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

load_dotenv()

def get_snowflake_connection():
    """Create and return a Snowflake connection"""
    SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT")
    SNOWFLAKE_USERNAME = os.getenv("SNOWFLAKE_USERNAME")
    SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE")
    SNOWFLAKE_DATABASE = os.getenv("SNOWFLAKE_DATABASE")
    SNOWFLAKE_SCHEMA = os.getenv("SNOWFLAKE_SCHEMA")
    SNOWFLAKE_PRIVATE_KEY_PATH = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")
    ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

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

        if ENVIRONMENT == "development":
            connect_params["insecure_mode"] = True

        return snowflake.connector.connect(**connect_params)
    except Exception as e:
        print(f"Snowflake connection error: {e}")
        raise


def verify_matches():
    """Verify all scout reports have valid match references"""
    conn = get_snowflake_connection()
    cursor = conn.cursor()

    try:
        print("=" * 70)
        print("MATCH REFERENCE VERIFICATION")
        print("=" * 70)
        print()

        # Check total scout reports
        cursor.execute("SELECT COUNT(*) FROM scout_reports")
        total_reports = cursor.fetchone()[0]
        print(f"📊 Total scout reports: {total_reports}")

        # Check reports with NULL match_id
        cursor.execute("SELECT COUNT(*) FROM scout_reports WHERE MATCH_ID IS NULL")
        null_match_reports = cursor.fetchone()[0]
        print(f"❌ Reports with NULL match_id: {null_match_reports}")

        # Check reports with valid match references (PROPER QUERY)
        # A match reference is valid if MATCH_ID matches either ID or CAFC_MATCH_ID in matches table
        cursor.execute("""
            SELECT COUNT(*)
            FROM scout_reports sr
            WHERE sr.MATCH_ID IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM matches m
                  WHERE sr.MATCH_ID = m.ID
                     OR sr.MATCH_ID = m.CAFC_MATCH_ID
              )
        """)
        valid_match_reports = cursor.fetchone()[0]
        print(f"✅ Reports with valid match references: {valid_match_reports}")

        # Check reports with invalid match references (orphaned)
        cursor.execute("""
            SELECT COUNT(*)
            FROM scout_reports sr
            WHERE sr.MATCH_ID IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM matches m
                  WHERE sr.MATCH_ID = m.ID
                     OR sr.MATCH_ID = m.CAFC_MATCH_ID
              )
        """)
        orphaned_reports = cursor.fetchone()[0]
        print(f"⚠️  Reports with orphaned match IDs: {orphaned_reports}")

        print()
        print("=" * 70)
        print("BREAKDOWN BY MATCH TYPE")
        print("=" * 70)
        print()

        # Reports linked to external matches (via ID)
        cursor.execute("""
            SELECT COUNT(DISTINCT sr.ID)
            FROM scout_reports sr
            JOIN matches m ON sr.MATCH_ID = m.ID
            WHERE m.DATA_SOURCE = 'external'
        """)
        external_match_reports = cursor.fetchone()[0]
        print(f"📦 Reports linked to external matches: {external_match_reports}")

        # Reports linked to internal matches (via CAFC_MATCH_ID)
        cursor.execute("""
            SELECT COUNT(DISTINCT sr.ID)
            FROM scout_reports sr
            JOIN matches m ON sr.MATCH_ID = m.CAFC_MATCH_ID
            WHERE m.DATA_SOURCE = 'internal'
        """)
        internal_match_reports = cursor.fetchone()[0]
        print(f"🏠 Reports linked to internal matches: {internal_match_reports}")

        print()
        print("=" * 70)
        print("SUMMARY")
        print("=" * 70)
        print()

        accounted_for = null_match_reports + valid_match_reports + orphaned_reports
        print(f"Total reports: {total_reports}")
        print(f"Reports accounted for: {accounted_for}")
        print()

        if orphaned_reports == 0:
            print("🎉 SUCCESS! All non-null scout reports have valid match references!")
        else:
            print(f"⚠️  WARNING: {orphaned_reports} reports still have invalid match references")
            print()
            print("Showing orphaned reports:")
            cursor.execute("""
                SELECT sr.ID, sr.MATCH_ID, sr.CREATED_AT
                FROM scout_reports sr
                WHERE sr.MATCH_ID IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM matches m
                      WHERE sr.MATCH_ID = m.ID
                         OR sr.MATCH_ID = m.CAFC_MATCH_ID
                  )
                ORDER BY sr.CREATED_AT DESC
                LIMIT 10
            """)
            orphaned = cursor.fetchall()
            for report in orphaned:
                print(f"  Report ID: {report[0]}, Match ID: {report[1]}, Created: {report[2]}")

    except Exception as e:
        print(f"Error during verification: {e}")
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    verify_matches()
