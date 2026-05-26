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

print("=" * 100)
print("UPDATING ADDITIONAL TEAM NAMES AND METADATA")
print("=" * 100)

# Additional team mappings requested by user
additional_mappings = {
    'Aberdeen': 'Aberdeen FC',
    'Austin': 'Austin FC',
    'Aveley': 'Aveley FC',
    'Barnsley': 'FC Barnsley',
    'Celtic': 'Celtic Glasgow',
    'Italy U19': 'Italien U19',
    'Newcastle': 'Newcastle United',
    'Sporting CP B': 'Sporting Lissabon B',
    'Sydney': 'Sydney FC'
}

for internal_name, external_name in additional_mappings.items():
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

        if home_count > 0 or away_count > 0:
            print(f"  ✓ Renamed and updated {home_count} home teams, {away_count} away teams")
            print(f"    Squad ID: {squad_id}, Type: {squad_type}, Country: {squad_country_name}")
        else:
            print(f"  ⚠ No matches found with '{internal_name}' (already updated or doesn't exist)")
    else:
        print(f"  ✗ No metadata found for '{external_name}' in external matches")

conn.commit()
print("\n" + "=" * 100)
print("VERIFICATION")
print("=" * 100)

# Verify updates
print("\nVerifying team name updates...")
for internal_name, external_name in additional_mappings.items():
    cursor.execute("""
        SELECT COUNT(*)
        FROM matches
        WHERE DATA_SOURCE = 'internal'
          AND (HOMESQUADNAME = %s OR AWAYSQUADNAME = %s)
    """, (external_name, external_name))
    count = cursor.fetchone()[0]

    cursor.execute("""
        SELECT COUNT(*)
        FROM matches
        WHERE DATA_SOURCE = 'internal'
          AND (HOMESQUADNAME = %s OR AWAYSQUADNAME = %s)
    """, (internal_name, internal_name))
    old_count = cursor.fetchone()[0]

    if count > 0:
        print(f"  ✓ '{external_name}': {count} matches")
    if old_count > 0:
        print(f"  ⚠ '{internal_name}': {old_count} matches still use old name")

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
print("COMPLETE")
print("=" * 100)
