import snowflake.connector
import os
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from datetime import datetime, timedelta
from rapidfuzz import fuzz

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
print("CHECKING ALL INTERNAL MATCHES FOR EXTERNAL COUNTERPARTS")
print("=" * 100)

# Get all internal matches
cursor.execute("""
    SELECT
        CAFC_MATCH_ID,
        HOMESQUADNAME,
        AWAYSQUADNAME,
        SCHEDULEDDATE
    FROM matches
    WHERE DATA_SOURCE = 'internal'
    ORDER BY SCHEDULEDDATE
""")

internal_matches = cursor.fetchall()

print(f"\nFound {len(internal_matches)} internal matches to check\n")

# Get all external matches
cursor.execute("""
    SELECT
        ID,
        HOMESQUADNAME,
        AWAYSQUADNAME,
        SCHEDULEDDATE
    FROM matches
    WHERE DATA_SOURCE = 'external'
""")

external_matches = cursor.fetchall()

print(f"Comparing against {len(external_matches)} external matches\n")
print("=" * 100)

exact_matches = []
near_matches = []

for internal in internal_matches:
    int_cafc_id, int_home, int_away, int_date = internal

    if not int_date:
        continue

    # Convert to datetime if needed
    if isinstance(int_date, str):
        int_date_obj = datetime.strptime(int_date.split()[0], '%Y-%m-%d')
    else:
        int_date_obj = int_date

    print(f"\nChecking: {int_home} vs {int_away} ({int_date_obj.date()})")

    # Check for exact matches (same teams, within 7 days)
    for external in external_matches:
        ext_id, ext_home, ext_away, ext_date = external

        if not ext_date:
            continue

        # Convert to datetime if needed
        if isinstance(ext_date, str):
            ext_date_obj = datetime.strptime(ext_date.split()[0], '%Y-%m-%d')
        else:
            ext_date_obj = ext_date

        # Check date difference
        date_diff = abs((int_date_obj - ext_date_obj).days)

        if date_diff > 7:
            continue

        # Check if teams match (exact or reversed)
        if ((int_home == ext_home and int_away == ext_away) or
            (int_home == ext_away and int_away == ext_home)):

            # Count reports
            cursor.execute("SELECT COUNT(*) FROM scout_reports WHERE MATCH_ID = %s", (int_cafc_id,))
            int_reports = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM scout_reports WHERE MATCH_ID = %s", (ext_id,))
            ext_reports = cursor.fetchone()[0]

            if date_diff == 0:
                print(f"  ✓ EXACT MATCH FOUND (same day):")
                exact_matches.append({
                    'internal_id': int_cafc_id,
                    'external_id': ext_id,
                    'home': int_home,
                    'away': int_away,
                    'int_date': int_date_obj,
                    'ext_date': ext_date_obj,
                    'int_reports': int_reports,
                    'ext_reports': ext_reports,
                    'date_diff': date_diff
                })
            else:
                print(f"  ~ NEAR MATCH FOUND ({date_diff} days difference):")
                near_matches.append({
                    'internal_id': int_cafc_id,
                    'external_id': ext_id,
                    'home': int_home,
                    'away': int_away,
                    'int_date': int_date_obj,
                    'ext_date': ext_date_obj,
                    'int_reports': int_reports,
                    'ext_reports': ext_reports,
                    'date_diff': date_diff
                })

            print(f"    External: {ext_home} vs {ext_away} ({ext_date_obj.date()})")
            print(f"    Internal ID {int_cafc_id}: {int_reports} reports")
            print(f"    External ID {ext_id}: {ext_reports} reports")
            break

print("\n" + "=" * 100)
print("SUMMARY OF FINDINGS")
print("=" * 100)

if exact_matches:
    print(f"\n✓ EXACT MATCHES (same day): {len(exact_matches)}")
    print("=" * 80)
    for match in exact_matches:
        print(f"\n{match['home']} vs {match['away']}")
        print(f"  Internal (CAFC_ID {match['internal_id']}): {match['int_date'].date()} - {match['int_reports']} reports")
        print(f"  External (ID {match['external_id']}): {match['ext_date'].date()} - {match['ext_reports']} reports")
        print(f"  → ACTION: Migrate {match['int_reports']} reports to external match, delete internal")
else:
    print("\n✓ No exact same-day matches found")

if near_matches:
    print(f"\n\n~ NEAR MATCHES (within 7 days): {len(near_matches)}")
    print("=" * 80)
    for match in near_matches:
        print(f"\n{match['home']} vs {match['away']}")
        print(f"  Internal (CAFC_ID {match['internal_id']}): {match['int_date'].date()} - {match['int_reports']} reports")
        print(f"  External (ID {match['external_id']}): {match['ext_date'].date()} - {match['ext_reports']} reports")
        print(f"  Date difference: {match['date_diff']} days")
        print(f"  → ACTION: Review manually - may be different matches or data issue")
else:
    print("\n✓ No near matches found")

# Count internal matches without external counterparts
internal_only_count = len(internal_matches) - len(exact_matches) - len(near_matches)
print(f"\n\nInternal matches WITHOUT external counterparts: {internal_only_count}")
print("=" * 80)
print("These are likely youth/reserve team friendlies or matches not in the external database")

cursor.close()
conn.close()

print("\n" + "=" * 100)
print("ANALYSIS COMPLETE")
print("=" * 100)
