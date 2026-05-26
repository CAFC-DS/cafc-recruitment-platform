import snowflake.connector
import os
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from datetime import datetime

load_dotenv()

# Load private key for authentication
with open(os.getenv('SNOWFLAKE_PRIVATE_KEY_PATH'), 'rb') as key:
    p_key = serialization.load_pem_private_key(
        key.read(),
        password=None,
        backend=default_backend()
    )

pkb = p_key.private_bytes(
    encoding=serialization.Encoding.DER,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption()
)

conn = snowflake.connector.connect(
    user=os.getenv('SNOWFLAKE_USERNAME'),
    account=os.getenv('SNOWFLAKE_ACCOUNT'),
    warehouse=os.getenv('SNOWFLAKE_WAREHOUSE'),
    database=os.getenv('SNOWFLAKE_DATABASE'),
    schema=os.getenv('SNOWFLAKE_SCHEMA'),
    private_key=pkb
)

cursor = conn.cursor()

print("=" * 100)
print("FINDING WESTERN UNITED FC vs SYDNEY FC DUPLICATES")
print("=" * 100)

# Find all Western United FC vs Sydney FC matches
cursor.execute("""
    SELECT
        COALESCE(ID, CAFC_MATCH_ID) as match_id,
        HOMESQUADNAME,
        AWAYSQUADNAME,
        SCHEDULEDDATE,
        DATA_SOURCE,
        CAFC_MATCH_ID,
        ID
    FROM matches
    WHERE (HOMESQUADNAME = 'Western United FC' AND AWAYSQUADNAME = 'Sydney FC')
       OR (HOMESQUADNAME = 'Sydney FC' AND AWAYSQUADNAME = 'Western United FC')
    ORDER BY SCHEDULEDDATE, DATA_SOURCE
""")

western_sydney_matches = cursor.fetchall()

print(f"\nFound {len(western_sydney_matches)} Western United FC vs Sydney FC matches:\n")
for match in western_sydney_matches:
    match_id, home, away, date, source, cafc_id, ext_id = match
    print(f"  [{source.upper():8}] {home} vs {away}")
    print(f"    Date: {date}, CAFC_ID: {cafc_id}, External ID: {ext_id}")

    # Count scout reports
    if source == 'internal':
        cursor.execute("""
            SELECT COUNT(*)
            FROM scout_reports
            WHERE MATCH_ID = %s
        """, (cafc_id,))
    else:
        cursor.execute("""
            SELECT COUNT(*)
            FROM scout_reports
            WHERE MATCH_ID = %s
        """, (ext_id,))

    report_count = cursor.fetchone()[0]
    print(f"    Scout Reports: {report_count}\n")

# Get the fixture date from one of these matches
if western_sydney_matches:
    fixture_date = western_sydney_matches[0][3]

    print("=" * 100)
    print(f"CHECKING ALL MATCHES ON FIXTURE DATE: {fixture_date}")
    print("=" * 100)

    # Get all matches on this date
    cursor.execute("""
        SELECT
            COALESCE(ID, CAFC_MATCH_ID) as match_id,
            HOMESQUADNAME,
            AWAYSQUADNAME,
            DATA_SOURCE,
            CAFC_MATCH_ID,
            ID
        FROM matches
        WHERE SCHEDULEDDATE = %s
        ORDER BY DATA_SOURCE, HOMESQUADNAME
    """, (fixture_date,))

    all_matches_on_date = cursor.fetchall()

    print(f"\nFound {len(all_matches_on_date)} matches on {fixture_date}:\n")

    internal_matches = []
    external_matches = []

    for match in all_matches_on_date:
        match_id, home, away, source, cafc_id, ext_id = match
        print(f"[{source.upper():8}] {home} vs {away}")
        print(f"  Match ID: {match_id}, CAFC_ID: {cafc_id}, External ID: {ext_id}")

        # Count scout reports
        if source == 'internal':
            cursor.execute("""
                SELECT COUNT(*)
                FROM scout_reports
                WHERE MATCH_ID = %s
            """, (cafc_id,))
            internal_matches.append({
                'cafc_id': cafc_id,
                'home': home,
                'away': away,
                'reports': cursor.fetchone()[0]
            })
        else:
            cursor.execute("""
                SELECT COUNT(*)
                FROM scout_reports
                WHERE MATCH_ID = %s
            """, (ext_id,))
            external_matches.append({
                'ext_id': ext_id,
                'home': home,
                'away': away,
                'reports': cursor.fetchone()[0]
            })

        print(f"  Scout Reports: {cursor.fetchone()[0] if source == 'internal' else external_matches[-1]['reports']}\n")

    print("=" * 100)
    print("CHECKING FOR DUPLICATE MATCHES (INTERNAL vs EXTERNAL)")
    print("=" * 100)

    duplicates_to_fix = []

    for internal in internal_matches:
        for external in external_matches:
            # Check if teams match (allowing for reversed home/away)
            if ((internal['home'] == external['home'] and internal['away'] == external['away']) or
                (internal['home'] == external['away'] and internal['away'] == external['home'])):

                print(f"\n✓ DUPLICATE FOUND:")
                print(f"  Internal (CAFC_ID {internal['cafc_id']}): {internal['home']} vs {internal['away']} ({internal['reports']} reports)")
                print(f"  External (ID {external['ext_id']}): {external['home']} vs {external['away']} ({external['reports']} reports)")

                duplicates_to_fix.append({
                    'internal_id': internal['cafc_id'],
                    'external_id': external['ext_id'],
                    'internal_reports': internal['reports'],
                    'description': f"{internal['home']} vs {internal['away']}"
                })

    if duplicates_to_fix:
        print("\n" + "=" * 100)
        print(f"SUMMARY: Found {len(duplicates_to_fix)} duplicate matches to fix")
        print("=" * 100)
        for dup in duplicates_to_fix:
            print(f"  - {dup['description']}")
            print(f"    Internal ID: {dup['internal_id']} ({dup['internal_reports']} reports)")
            print(f"    External ID: {dup['external_id']}")
    else:
        print("\n✓ No duplicates found on this fixture date")

cursor.close()
conn.close()

print("\n" + "=" * 100)
print("ANALYSIS COMPLETE")
print("=" * 100)
