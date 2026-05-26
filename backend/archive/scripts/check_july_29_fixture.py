import snowflake.connector
import os
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

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

print('=' * 100)
print('ALL MATCHES ON 2025-07-29')
print('=' * 100)

cursor.execute("""
    SELECT
        COALESCE(ID, CAFC_MATCH_ID) as match_id,
        HOMESQUADNAME,
        AWAYSQUADNAME,
        DATA_SOURCE,
        CAFC_MATCH_ID,
        ID,
        SCHEDULEDDATE
    FROM matches
    WHERE DATE(SCHEDULEDDATE) = '2025-07-29'
    ORDER BY DATA_SOURCE, HOMESQUADNAME
""")

internal_matches = []
external_matches = []

for row in cursor.fetchall():
    match_id, home, away, source, cafc_id, ext_id, date = row
    print(f'\n[{source.upper():8}] {home} vs {away}')
    print(f'  Date: {date}')
    print(f'  Match ID: {match_id}, CAFC_ID: {cafc_id}, External ID: {ext_id}')

    # Count reports
    if source == 'internal':
        cursor.execute('SELECT COUNT(*) FROM scout_reports WHERE MATCH_ID = %s', (cafc_id,))
        report_count = cursor.fetchone()[0]
        internal_matches.append({
            'cafc_id': cafc_id,
            'home': home,
            'away': away,
            'reports': report_count
        })
    else:
        cursor.execute('SELECT COUNT(*) FROM scout_reports WHERE MATCH_ID = %s', (ext_id,))
        report_count = cursor.fetchone()[0]
        external_matches.append({
            'ext_id': ext_id,
            'home': home,
            'away': away,
            'reports': report_count
        })

    print(f'  Scout Reports: {report_count}')

print('\n' + '=' * 100)
print('CHECKING FOR DUPLICATES')
print('=' * 100)

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

# Check for internal duplicates (same teams, both internal)
print('\n' + '=' * 100)
print('CHECKING FOR INTERNAL DUPLICATES (SAME TEAMS)')
print('=' * 100)

internal_duplicates = []
for i, match1 in enumerate(internal_matches):
    for match2 in internal_matches[i+1:]:
        if ((match1['home'] == match2['home'] and match1['away'] == match2['away']) or
            (match1['home'] == match2['away'] and match1['away'] == match2['home'])):

            print(f"\n✓ INTERNAL DUPLICATE FOUND:")
            print(f"  Match 1 (CAFC_ID {match1['cafc_id']}): {match1['home']} vs {match1['away']} ({match1['reports']} reports)")
            print(f"  Match 2 (CAFC_ID {match2['cafc_id']}): {match2['home']} vs {match2['away']} ({match2['reports']} reports)")

            internal_duplicates.append({
                'match1_id': match1['cafc_id'],
                'match1_reports': match1['reports'],
                'match2_id': match2['cafc_id'],
                'match2_reports': match2['reports'],
                'description': f"{match1['home']} vs {match1['away']}"
            })

if duplicates_to_fix:
    print('\n' + '=' * 100)
    print(f'SUMMARY: Found {len(duplicates_to_fix)} internal-external duplicates to fix')
    print('=' * 100)
    for dup in duplicates_to_fix:
        print(f"  - {dup['description']}")
        print(f"    Internal ID: {dup['internal_id']} ({dup['internal_reports']} reports) → External ID: {dup['external_id']}")

if internal_duplicates:
    print('\n' + '=' * 100)
    print(f'SUMMARY: Found {len(internal_duplicates)} internal-only duplicates to merge')
    print('=' * 100)
    for dup in internal_duplicates:
        print(f"  - {dup['description']}")
        print(f"    Keep: CAFC_ID {dup['match2_id']} ({dup['match2_reports']} reports)")
        print(f"    Delete: CAFC_ID {dup['match1_id']} ({dup['match1_reports']} reports)")

cursor.close()
conn.close()

print('\n' + '=' * 100)
print('ANALYSIS COMPLETE')
print('=' * 100)
