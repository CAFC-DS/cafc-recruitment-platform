import snowflake.connector
import os
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from datetime import datetime, timedelta

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
print("FINDING ALL INTERNAL MATCHES")
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

print(f"\nFound {len(internal_matches)} internal matches\n")

# For each internal match, check for:
# 1. Exact match on same date
# 2. Match within 7 days
all_duplicates = []
internal_only_duplicates = []

for internal in internal_matches:
    int_cafc_id, int_home, int_away, int_date = internal

    if not int_date:
        continue

    # Convert to datetime if needed
    if isinstance(int_date, str):
        int_date_obj = datetime.strptime(int_date.split()[0], '%Y-%m-%d')
    else:
        int_date_obj = int_date

    # Check for external matches on same date
    cursor.execute("""
        SELECT
            ID,
            HOMESQUADNAME,
            AWAYSQUADNAME,
            SCHEDULEDDATE
        FROM matches
        WHERE DATA_SOURCE = 'external'
          AND DATE(SCHEDULEDDATE) = DATE(%s)
          AND ((HOMESQUADNAME = %s AND AWAYSQUADNAME = %s)
           OR (HOMESQUADNAME = %s AND AWAYSQUADNAME = %s))
    """, (int_date, int_home, int_away, int_away, int_home))

    exact_matches = cursor.fetchall()

    if exact_matches:
        for ext_match in exact_matches:
            ext_id, ext_home, ext_away, ext_date = ext_match

            # Count reports
            cursor.execute("SELECT COUNT(*) FROM scout_reports WHERE MATCH_ID = %s", (int_cafc_id,))
            int_reports = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM scout_reports WHERE MATCH_ID = %s", (ext_id,))
            ext_reports = cursor.fetchone()[0]

            all_duplicates.append({
                'internal_id': int_cafc_id,
                'external_id': ext_id,
                'home': int_home,
                'away': int_away,
                'int_date': int_date,
                'ext_date': ext_date,
                'int_reports': int_reports,
                'ext_reports': ext_reports,
                'match_type': 'EXACT_SAME_DAY'
            })

    # Also check for other internal matches with same teams on same day
    cursor.execute("""
        SELECT
            CAFC_MATCH_ID
        FROM matches
        WHERE DATA_SOURCE = 'internal'
          AND CAFC_MATCH_ID != %s
          AND DATE(SCHEDULEDDATE) = DATE(%s)
          AND ((HOMESQUADNAME = %s AND AWAYSQUADNAME = %s)
           OR (HOMESQUADNAME = %s AND AWAYSQUADNAME = %s))
    """, (int_cafc_id, int_date, int_home, int_away, int_away, int_home))

    other_internal = cursor.fetchall()

    for other in other_internal:
        other_id = other[0]

        # Count reports for both
        cursor.execute("SELECT COUNT(*) FROM scout_reports WHERE MATCH_ID = %s", (int_cafc_id,))
        reports1 = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM scout_reports WHERE MATCH_ID = %s", (other_id,))
        reports2 = cursor.fetchone()[0]

        # Check if we haven't already recorded this pair
        already_recorded = False
        for dup in internal_only_duplicates:
            if (dup['match1_id'] == other_id and dup['match2_id'] == int_cafc_id) or \
               (dup['match1_id'] == int_cafc_id and dup['match2_id'] == other_id):
                already_recorded = True
                break

        if not already_recorded:
            internal_only_duplicates.append({
                'match1_id': int_cafc_id,
                'match1_reports': reports1,
                'match2_id': other_id,
                'match2_reports': reports2,
                'home': int_home,
                'away': int_away,
                'date': int_date
            })

print("\n" + "=" * 100)
print(f"INTERNAL-EXTERNAL DUPLICATES: {len(all_duplicates)}")
print("=" * 100)

if all_duplicates:
    for dup in all_duplicates:
        print(f"\n{dup['home']} vs {dup['away']}")
        print(f"  Internal (CAFC_ID {dup['internal_id']}): {dup['int_date']} - {dup['int_reports']} reports")
        print(f"  External (ID {dup['external_id']}): {dup['ext_date']} - {dup['ext_reports']} reports")
else:
    print("\n✓ No internal-external duplicates found")

print("\n" + "=" * 100)
print(f"INTERNAL-ONLY DUPLICATES: {len(internal_only_duplicates)}")
print("=" * 100)

if internal_only_duplicates:
    for dup in internal_only_duplicates:
        print(f"\n{dup['home']} vs {dup['away']} ({dup['date']})")
        print(f"  Match 1 (CAFC_ID {dup['match1_id']}): {dup['match1_reports']} reports")
        print(f"  Match 2 (CAFC_ID {dup['match2_id']}): {dup['match2_reports']} reports")
        print(f"  → Recommend: Keep ID {dup['match2_id'] if dup['match2_reports'] >= dup['match1_reports'] else dup['match1_id']}")
else:
    print("\n✓ No internal-only duplicates found")

cursor.close()
conn.close()

print("\n" + "=" * 100)
print("ANALYSIS COMPLETE")
print("=" * 100)
