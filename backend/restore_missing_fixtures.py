#!/usr/bin/env python3
"""
Script to restore missing fixtures and update orphaned scout reports.

This script:
1. Re-inserts deleted matches as internal fixtures
2. Updates scout reports to reference the new match IDs
3. Verifies all reports have valid match references
"""

import os
from dotenv import load_dotenv
import snowflake.connector
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from datetime import datetime

# Load environment variables
load_dotenv()

# Fixture data mapping: old_match_id -> fixture details
FIXTURE_MAPPINGS = {
    901: {
        "home_team": "Western United",
        "away_team": "Sydney",
        "fixture_date": "29/07/2025",
        "report_ids": [27101, 27202, 27102, 27201, 27301, 27401]
    },
    1801: {
        "home_team": "Western United",
        "away_team": "Sydney",
        "fixture_date": "29/07/2025",  # Same as 901
        "report_ids": [37001, 37102, 37002, 37003, 36802]
    },
    902: {
        "home_team": "Czechia U21",
        "away_team": "Scotland U21",
        "fixture_date": "05/09/2025",
        "report_ids": [27302, 27002, 27502, 27103, 26903, 27303, 27503]
    },
    1301: {
        "home_team": "Czechia U21",
        "away_team": "Scotland U21",
        "fixture_date": "05/09/2025",  # Same as 902
        "report_ids": [26902]
    },
    1201: {
        "home_team": "Celtic",
        "away_team": "Newcastle",
        "fixture_date": "17/07/2025",
        "report_ids": [29501, 29401, 29701, 29601]
    },
    1701: {
        "home_team": "Ilves Tampere",
        "away_team": "AZ Alkmaar",
        "fixture_date": "24/07/2025",
        "report_ids": [36302, 36002, 36402, 35702, 35802, 36104, 36103, 36102]
    },
    1501: {
        "home_team": "Czechia U19",
        "away_team": "Italy U19",
        "fixture_date": "23/03/2024",
        "report_ids": [32301, 32201]
    },
    1901: {
        "home_team": "Cliftonville",
        "away_team": "Dungannon",
        "fixture_date": "03/05/2025",
        "report_ids": [37601]
    },
    701: {
        "home_team": "Metropolitan Police",
        "away_team": "Egham Town",
        "fixture_date": "27/09/2025",
        "report_ids": [25903]
    },
    801: {
        "home_team": "Gillingham U17",
        "away_team": "Cambridge United U17",
        "fixture_date": "30/09/2025",
        "report_ids": [26901, 27001]
    },
    1001: {
        "home_team": "Liverpool U17",
        "away_team": "West Brom U17",
        "fixture_date": "19/08/2025",
        "report_ids": [27501]
    },
    1602: {
        "home_team": "Aberdeen",
        "away_team": "Celtic",
        "fixture_date": "24/05/2025",
        "report_ids": [36003, 35703, 36105, 36004]
    },
    601: {
        "home_team": "Leeds United U21",
        "away_team": "Sporting CP B",
        "fixture_date": "25/09/2025",
        "report_ids": [25904, 26501, 25801, 26502, 26202, 26004, 25905, 26403, 25804, 26402]
    },
    1101: {
        "home_team": "Notts County",
        "away_team": "Barnsley",
        "fixture_date": "30/09/2025",
        "report_ids": [28403, 28402, 28305, 27903, 28405, 27904, 28304, 28404]
    }
}


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


def convert_date(date_str):
    """Convert DD/MM/YYYY to YYYY-MM-DD format for Snowflake"""
    dt = datetime.strptime(date_str, "%d/%m/%Y")
    return dt.strftime("%Y-%m-%d")


def get_unique_fixtures():
    """Group duplicate fixtures together"""
    unique_fixtures = {}

    # Group by (home_team, away_team, date)
    for old_match_id, fixture_data in FIXTURE_MAPPINGS.items():
        key = (
            fixture_data["home_team"],
            fixture_data["away_team"],
            fixture_data["fixture_date"]
        )

        if key not in unique_fixtures:
            unique_fixtures[key] = {
                "home_team": fixture_data["home_team"],
                "away_team": fixture_data["away_team"],
                "fixture_date": fixture_data["fixture_date"],
                "old_match_ids": [old_match_id],
                "report_ids": fixture_data["report_ids"].copy()
            }
        else:
            unique_fixtures[key]["old_match_ids"].append(old_match_id)
            unique_fixtures[key]["report_ids"].extend(fixture_data["report_ids"])

    return list(unique_fixtures.values())


def restore_fixtures():
    """Main restoration function"""
    conn = None

    try:
        print("=" * 70)
        print("🔄 FIXTURE RESTORATION SCRIPT")
        print("=" * 70)
        print()

        # Connect to Snowflake
        print("📡 Connecting to Snowflake...")
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        print("✅ Connected successfully\n")

        # Get unique fixtures
        unique_fixtures = get_unique_fixtures()
        print(f"📊 Found {len(unique_fixtures)} unique fixtures to restore")
        print(f"📝 Total scout reports to update: {sum(len(f['report_ids']) for f in unique_fixtures)}\n")

        # Track mappings for updating scout reports
        old_to_new_mappings = {}
        matches_inserted = 0

        print("=" * 70)
        print("STEP 1: RE-INSERTING MATCHES")
        print("=" * 70)
        print()

        for idx, fixture in enumerate(unique_fixtures, 1):
            home_team = fixture["home_team"]
            away_team = fixture["away_team"]
            fixture_date = convert_date(fixture["fixture_date"])
            old_ids = fixture["old_match_ids"]

            print(f"{idx}. {home_team} vs {away_team} ({fixture_date})")
            print(f"   Old Match IDs: {old_ids}")

            # Check if match already exists
            cursor.execute("""
                SELECT CAFC_MATCH_ID, ID
                FROM matches
                WHERE HOMESQUADNAME = %s
                  AND AWAYSQUADNAME = %s
                  AND SCHEDULEDDATE = %s
            """, (home_team, away_team, fixture_date))

            existing = cursor.fetchone()

            if existing:
                cafc_match_id = existing[0]
                print(f"   ⚠️  Match already exists with CAFC_MATCH_ID: {cafc_match_id}")
            else:
                # Get next sequence value for CAFC_MATCH_ID
                cursor.execute("SELECT manual_match_seq.NEXTVAL")
                cafc_match_id = cursor.fetchone()[0]

                # Insert the match
                cursor.execute("""
                    INSERT INTO matches (
                        HOMESQUADNAME,
                        AWAYSQUADNAME,
                        SCHEDULEDDATE,
                        CAFC_MATCH_ID,
                        DATA_SOURCE
                    ) VALUES (%s, %s, %s, %s, %s)
                """, (home_team, away_team, fixture_date, cafc_match_id, 'internal'))

                matches_inserted += 1
                print(f"   ✅ Inserted with new CAFC_MATCH_ID: {cafc_match_id}")

            # Map all old IDs to the new CAFC_MATCH_ID
            for old_id in old_ids:
                old_to_new_mappings[old_id] = cafc_match_id

            print()

        # Commit match insertions
        conn.commit()
        print(f"✅ Successfully inserted {matches_inserted} new matches\n")

        print("=" * 70)
        print("STEP 2: UPDATING SCOUT REPORTS")
        print("=" * 70)
        print()

        reports_updated = 0

        for old_match_id, new_cafc_match_id in old_to_new_mappings.items():
            fixture = FIXTURE_MAPPINGS[old_match_id]
            report_ids = fixture["report_ids"]

            print(f"Updating {len(report_ids)} reports: old match ID {old_match_id} → new CAFC_MATCH_ID {new_cafc_match_id}")

            for report_id in report_ids:
                cursor.execute("""
                    UPDATE scout_reports
                    SET MATCH_ID = %s
                    WHERE ID = %s
                """, (new_cafc_match_id, report_id))

                if cursor.rowcount > 0:
                    reports_updated += 1

            print(f"   ✅ Updated {len(report_ids)} reports")

        # Commit scout report updates
        conn.commit()
        print(f"\n✅ Successfully updated {reports_updated} scout reports\n")

        print("=" * 70)
        print("STEP 3: VERIFICATION")
        print("=" * 70)
        print()

        # Check for remaining orphaned reports
        cursor.execute("""
            SELECT COUNT(*)
            FROM scout_reports sr
            LEFT JOIN matches m ON (
                sr.MATCH_ID = m.ID OR
                sr.MATCH_ID = m.CAFC_MATCH_ID
            )
            WHERE sr.MATCH_ID IS NOT NULL
              AND m.ID IS NULL
        """)

        orphaned_count = cursor.fetchone()[0]

        if orphaned_count == 0:
            print("✅ All scout reports now have valid match references!")
        else:
            print(f"⚠️  Warning: {orphaned_count} scout reports still have invalid match references")

        print()
        print("=" * 70)
        print("SUMMARY")
        print("=" * 70)
        print(f"✅ Matches inserted: {matches_inserted}")
        print(f"✅ Scout reports updated: {reports_updated}")
        print(f"✅ Orphaned reports remaining: {orphaned_count}")
        print()

        print("=" * 70)
        print("MATCH ID MAPPINGS")
        print("=" * 70)
        for old_id, new_id in sorted(old_to_new_mappings.items()):
            print(f"Old Match ID {old_id:4d} → New CAFC_MATCH_ID {new_id}")

        print()
        print("🎉 Fixture restoration completed successfully!")
        print("=" * 70)

    except Exception as e:
        print(f"\n❌ Error during restoration: {e}")
        if conn:
            conn.rollback()
            print("🔄 Changes rolled back")
        raise

    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    restore_fixtures()
