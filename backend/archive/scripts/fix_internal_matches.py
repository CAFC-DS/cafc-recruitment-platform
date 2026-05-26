import snowflake.connector
import os
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
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
print("STEP 1: UPDATING EXACT MATCHES (24 teams)")
print("=" * 100)

# Get exact matches
exact_matches = [
    'AZ Alkmaar', 'Aston Villa U21', 'Birmingham City U18', 'Celtic Glasgow',
    'Crystal Palace U21', 'Eastbourne Borough', 'FC Stevenage', 'FK Partizan Belgrad',
    'Falkirk FC', 'Glasgow Rangers', 'Heart of Midlothian FC', 'Hibernian FC',
    'Ilves Tampere', 'Kashiwa Reysol', 'Kawasaki Frontale', 'Leeds United U21',
    'Livingston FC', 'Maidstone United', 'Notts County', 'Peterborough United',
    'Sanfrecce Hiroshima', 'Shonan Bellmare', 'St. Mirren FC', 'Sydney FC'
]

# For each exact match, get the metadata from external matches
for team_name in exact_matches:
    print(f"\nProcessing: {team_name}")

    # Get metadata from external matches
    cursor.execute("""
        SELECT DISTINCT
            team_name, squad_id, squad_type, squad_country_id, squad_country_name,
            squad_skillcorner_id, squad_heimspiel_id, squad_wyscout_id
        FROM (
            SELECT
                HOMESQUADNAME as team_name,
                HOMESQUADID as squad_id,
                HOMESQUADTYPE as squad_type,
                HOMESQUADCOUNTRYID as squad_country_id,
                HOMESQUADCOUNTRYNAME as squad_country_name,
                HOMESQUADSKILLCORNERID as squad_skillcorner_id,
                HOMESQUADHEIMSPIELID as squad_heimspiel_id,
                HOMESQUADWYSCOUTID as squad_wyscout_id
            FROM matches
            WHERE DATA_SOURCE = 'external'
              AND HOMESQUADNAME = %s
            UNION
            SELECT
                AWAYSQUADNAME as team_name,
                AWAYSQUADID as squad_id,
                AWAYSQUADTYPE as squad_type,
                AWAYSQUADCOUNTRYID as squad_country_id,
                AWAYSQUADCOUNTRYNAME as squad_country_name,
                AWAYSQUADSKILLCORNERID as squad_skillcorner_id,
                AWAYSQUADHEIMSPIELID as squad_heimspiel_id,
                AWAYSQUADWYSCOUTID as squad_wyscout_id
            FROM matches
            WHERE DATA_SOURCE = 'external'
              AND AWAYSQUADNAME = %s
        )
        LIMIT 1
    """, (team_name, team_name))

    result = cursor.fetchone()
    if result:
        _, squad_id, squad_type, squad_country_id, squad_country_name, \
        squad_skillcorner_id, squad_heimspiel_id, squad_wyscout_id = result

        # Update home teams
        cursor.execute("""
            UPDATE matches
            SET HOMESQUADID = %s,
                HOMESQUADTYPE = %s,
                HOMESQUADCOUNTRYID = %s,
                HOMESQUADCOUNTRYNAME = %s,
                HOMESQUADSKILLCORNERID = %s,
                HOMESQUADHEIMSPIELID = %s,
                HOMESQUADWYSCOUTID = %s
            WHERE DATA_SOURCE = 'internal'
              AND HOMESQUADNAME = %s
        """, (squad_id, squad_type, squad_country_id, squad_country_name,
              squad_skillcorner_id, squad_heimspiel_id, squad_wyscout_id, team_name))
        home_count = cursor.rowcount

        # Update away teams
        cursor.execute("""
            UPDATE matches
            SET AWAYSQUADID = %s,
                AWAYSQUADTYPE = %s,
                AWAYSQUADCOUNTRYID = %s,
                AWAYSQUADCOUNTRYNAME = %s,
                AWAYSQUADSKILLCORNERID = %s,
                AWAYSQUADHEIMSPIELID = %s,
                AWAYSQUADWYSCOUTID = %s
            WHERE DATA_SOURCE = 'internal'
              AND AWAYSQUADNAME = %s
        """, (squad_id, squad_type, squad_country_id, squad_country_name,
              squad_skillcorner_id, squad_heimspiel_id, squad_wyscout_id, team_name))
        away_count = cursor.rowcount

        print(f"  ✓ Updated {home_count} home teams, {away_count} away teams with Squad ID: {squad_id}")
    else:
        print(f"  ✗ No metadata found")

conn.commit()
print("\n✓ Step 1 complete: Exact matches updated")

print("\n" + "=" * 100)
print("STEP 2: UPDATING FUZZY MATCHES (5 teams, excluding 2)")
print("=" * 100)

# Fuzzy matches to update (excluding Cambridge United U17 and Carshalton Athletic)
fuzzy_mappings = {
    'CF Montreal': 'CF Montréal',
    'Cliftonville': 'Cliftonville FC',
    'Manchester United U21 ': 'Manchester United U21',  # Note trailing space
    'Reading U18': 'FC Reading U18',
    'Western United': 'Western United FC'
}

for internal_name, external_name in fuzzy_mappings.items():
    print(f"\nProcessing: '{internal_name}' → '{external_name}'")

    # Get metadata from external matches
    cursor.execute("""
        SELECT DISTINCT
            team_name, squad_id, squad_type, squad_country_id, squad_country_name,
            squad_skillcorner_id, squad_heimspiel_id, squad_wyscout_id
        FROM (
            SELECT
                HOMESQUADNAME as team_name,
                HOMESQUADID as squad_id,
                HOMESQUADTYPE as squad_type,
                HOMESQUADCOUNTRYID as squad_country_id,
                HOMESQUADCOUNTRYNAME as squad_country_name,
                HOMESQUADSKILLCORNERID as squad_skillcorner_id,
                HOMESQUADHEIMSPIELID as squad_heimspiel_id,
                HOMESQUADWYSCOUTID as squad_wyscout_id
            FROM matches
            WHERE DATA_SOURCE = 'external'
              AND HOMESQUADNAME = %s
            UNION
            SELECT
                AWAYSQUADNAME as team_name,
                AWAYSQUADID as squad_id,
                AWAYSQUADTYPE as squad_type,
                AWAYSQUADCOUNTRYID as squad_country_id,
                AWAYSQUADCOUNTRYNAME as squad_country_name,
                AWAYSQUADSKILLCORNERID as squad_skillcorner_id,
                AWAYSQUADHEIMSPIELID as squad_heimspiel_id,
                AWAYSQUADWYSCOUTID as squad_wyscout_id
            FROM matches
            WHERE DATA_SOURCE = 'external'
              AND AWAYSQUADNAME = %s
        )
        LIMIT 1
    """, (external_name, external_name))

    result = cursor.fetchone()
    if result:
        _, squad_id, squad_type, squad_country_id, squad_country_name, \
        squad_skillcorner_id, squad_heimspiel_id, squad_wyscout_id = result

        # Update home teams (name + metadata)
        cursor.execute("""
            UPDATE matches
            SET HOMESQUADNAME = %s,
                HOMESQUADID = %s,
                HOMESQUADTYPE = %s,
                HOMESQUADCOUNTRYID = %s,
                HOMESQUADCOUNTRYNAME = %s,
                HOMESQUADSKILLCORNERID = %s,
                HOMESQUADHEIMSPIELID = %s,
                HOMESQUADWYSCOUTID = %s
            WHERE DATA_SOURCE = 'internal'
              AND HOMESQUADNAME = %s
        """, (external_name, squad_id, squad_type, squad_country_id, squad_country_name,
              squad_skillcorner_id, squad_heimspiel_id, squad_wyscout_id, internal_name))
        home_count = cursor.rowcount

        # Update away teams (name + metadata)
        cursor.execute("""
            UPDATE matches
            SET AWAYSQUADNAME = %s,
                AWAYSQUADID = %s,
                AWAYSQUADTYPE = %s,
                AWAYSQUADCOUNTRYID = %s,
                AWAYSQUADCOUNTRYNAME = %s,
                AWAYSQUADSKILLCORNERID = %s,
                AWAYSQUADHEIMSPIELID = %s,
                AWAYSQUADWYSCOUTID = %s
            WHERE DATA_SOURCE = 'internal'
              AND AWAYSQUADNAME = %s
        """, (external_name, squad_id, squad_type, squad_country_id, squad_country_name,
              squad_skillcorner_id, squad_heimspiel_id, squad_wyscout_id, internal_name))
        away_count = cursor.rowcount

        print(f"  ✓ Renamed and updated {home_count} home teams, {away_count} away teams")
        print(f"    Squad ID: {squad_id}, Type: {squad_type}, Country: {squad_country_name}")
    else:
        print(f"  ✗ No metadata found for '{external_name}'")

conn.commit()
print("\n✓ Step 2 complete: Fuzzy matches updated")

print("\n" + "=" * 100)
print("STEP 3: HANDLING DUPLICATE MATCHES")
print("=" * 100)

# Duplicate internal matches to remove
duplicates = [
    {'internal_id': 2801, 'external_id': 227117, 'description': 'Birmingham City U18 vs Reading U18'},
    {'internal_id': 3901, 'external_id': 186635, 'description': 'Kawasaki Frontale vs Kashiwa Reysol'}
]

for dup in duplicates:
    print(f"\n{'=' * 80}")
    print(f"Processing duplicate: {dup['description']}")
    print(f"Internal ID: {dup['internal_id']}, External ID: {dup['external_id']}")
    print(f"{'=' * 80}")

    internal_id = dup['internal_id']
    external_id = dup['external_id']

    # Check what needs to be migrated
    # For internal matches, scout_reports.MATCH_ID = matches.CAFC_MATCH_ID
    cursor.execute("""
        SELECT COUNT(*)
        FROM scout_reports sr
        INNER JOIN matches m ON sr.MATCH_ID = m.CAFC_MATCH_ID
        WHERE m.CAFC_MATCH_ID = %s AND m.DATA_SOURCE = 'internal'
    """, (internal_id,))
    report_count = cursor.fetchone()[0]

    print(f"\nFound {report_count} scout reports linked to internal match {internal_id}")

    if report_count > 0:
        print(f"Migrating {report_count} scout reports to external match {external_id}...")

        # Update scout reports to point to external match
        # Change MATCH_ID from internal CAFC_MATCH_ID to external ID
        cursor.execute("""
            UPDATE scout_reports
            SET MATCH_ID = %s
            WHERE MATCH_ID = %s
        """, (external_id, internal_id))

        print(f"  ✓ Migrated {cursor.rowcount} scout reports")

    # Now delete the internal match
    print(f"\nDeleting internal match {internal_id}...")
    cursor.execute("""
        DELETE FROM matches
        WHERE CAFC_MATCH_ID = %s
          AND DATA_SOURCE = 'internal'
    """, (internal_id,))

    if cursor.rowcount > 0:
        print(f"  ✓ Deleted internal match {internal_id}")
    else:
        print(f"  ✗ Failed to delete internal match {internal_id}")

conn.commit()
print("\n✓ Step 3 complete: Duplicate matches handled")

print("\n" + "=" * 100)
print("VERIFICATION")
print("=" * 100)

# Verify exact matches
print("\nVerifying exact matches have squad IDs...")
cursor.execute("""
    SELECT COUNT(*)
    FROM matches
    WHERE DATA_SOURCE = 'internal'
      AND (HOMESQUADNAME IN (
          'AZ Alkmaar', 'Aston Villa U21', 'Birmingham City U18', 'Celtic Glasgow',
          'Crystal Palace U21', 'Eastbourne Borough', 'FC Stevenage', 'FK Partizan Belgrad',
          'Falkirk FC', 'Glasgow Rangers', 'Heart of Midlothian FC', 'Hibernian FC',
          'Ilves Tampere', 'Kashiwa Reysol', 'Kawasaki Frontale', 'Leeds United U21',
          'Livingston FC', 'Maidstone United', 'Notts County', 'Peterborough United',
          'Sanfrecce Hiroshima', 'Shonan Bellmare', 'St. Mirren FC', 'Sydney FC'
      ) OR AWAYSQUADNAME IN (
          'AZ Alkmaar', 'Aston Villa U21', 'Birmingham City U18', 'Celtic Glasgow',
          'Crystal Palace U21', 'Eastbourne Borough', 'FC Stevenage', 'FK Partizan Belgrad',
          'Falkirk FC', 'Glasgow Rangers', 'Heart of Midlothian FC', 'Hibernian FC',
          'Ilves Tampere', 'Kashiwa Reysol', 'Kawasaki Frontale', 'Leeds United U21',
          'Livingston FC', 'Maidstone United', 'Notts County', 'Peterborough United',
          'Sanfrecce Hiroshima', 'Shonan Bellmare', 'St. Mirren FC', 'Sydney FC'
      ))
      AND (HOMESQUADID IS NULL OR AWAYSQUADID IS NULL)
""")
missing_count = cursor.fetchone()[0]
if missing_count == 0:
    print("✓ All exact matches have squad IDs")
else:
    print(f"✗ {missing_count} matches still missing squad IDs")

# Verify fuzzy match renames
print("\nVerifying fuzzy match renames...")
cursor.execute("""
    SELECT COUNT(*)
    FROM matches
    WHERE DATA_SOURCE = 'internal'
      AND (HOMESQUADNAME IN ('CF Montréal', 'Cliftonville FC', 'Manchester United U21', 'FC Reading U18', 'Western United FC')
       OR AWAYSQUADNAME IN ('CF Montréal', 'Cliftonville FC', 'Manchester United U21', 'FC Reading U18', 'Western United FC'))
""")
renamed_count = cursor.fetchone()[0]
print(f"✓ Found {renamed_count} matches with renamed fuzzy match teams")

# Verify duplicates removed
print("\nVerifying duplicate matches removed...")
cursor.execute("""
    SELECT COUNT(*)
    FROM matches
    WHERE DATA_SOURCE = 'internal'
      AND CAFC_MATCH_ID IN (2801, 3901)
""")
remaining_dupes = cursor.fetchone()[0]
if remaining_dupes == 0:
    print("✓ Duplicate matches successfully removed")
else:
    print(f"✗ {remaining_dupes} duplicate matches still exist")

# Summary
print("\n" + "=" * 100)
print("SUMMARY")
print("=" * 100)
cursor.execute("""
    SELECT COUNT(*) as total,
           SUM(CASE WHEN HOMESQUADID IS NOT NULL AND AWAYSQUADID IS NOT NULL THEN 1 ELSE 0 END) as with_ids,
           SUM(CASE WHEN HOMESQUADID IS NULL OR AWAYSQUADID IS NULL THEN 1 ELSE 0 END) as without_ids
    FROM matches
    WHERE DATA_SOURCE = 'internal'
""")
total, with_ids, without_ids = cursor.fetchone()
print(f"\nInternal matches:")
print(f"  Total: {total}")
print(f"  With squad IDs: {with_ids}")
print(f"  Without squad IDs: {without_ids}")

cursor.close()
conn.close()

print("\n" + "=" * 100)
print("ALL OPERATIONS COMPLETE")
print("=" * 100)
