"""
Generate SQL UPDATE statements with manual name mappings for close matches.
"""
import snowflake.connector
import os
from pathlib import Path
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

# Load .env
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

# Manual name mappings for teams that don't match exactly
NAME_MAPPINGS = {
    'Barnsley': 'FC Barnsley',
    'Aveley': 'Aveley FC',
    'Sporting CP B': 'Sporting Lissabon B',
    'Austin': 'Austin FC',
    'Western United': 'Western United FC',
    'Sydney': 'Sydney FC',
    'Celtic': 'Celtic Glasgow',
    'Newcastle': 'Newcastle United',
    'Aberdeen': 'Aberdeen FC',
    'Dungannon': 'Dungannon Swifts FC',
}

def get_private_key():
    """Load private key from file"""
    private_key_path = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")
    with open(private_key_path, "rb") as key:
        p_key = serialization.load_pem_private_key(
            key.read(),
            password=None,
            backend=default_backend()
        )
    return p_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )

def get_snowflake_connection():
    pkb = get_private_key()
    return snowflake.connector.connect(
        user=os.getenv("SNOWFLAKE_USERNAME"),
        account=os.getenv("SNOWFLAKE_ACCOUNT"),
        warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
        database=os.getenv("SNOWFLAKE_DATABASE"),
        schema=os.getenv("SNOWFLAKE_SCHEMA"),
        private_key=pkb,
        client_session_keep_alive=True,
    )

def main():
    conn = get_snowflake_connection()
    cursor = conn.cursor()

    print("="*120)
    print("BACKFILL SQL GENERATOR WITH NAME MAPPINGS")
    print("="*120)
    print()

    # Get external teams with metadata
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
            FROM MATCHES
            WHERE DATA_SOURCE = 'external'
              AND HOMESQUADNAME IS NOT NULL
              AND HOMESQUADID IS NOT NULL
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
            FROM MATCHES
            WHERE DATA_SOURCE = 'external'
              AND AWAYSQUADNAME IS NOT NULL
              AND AWAYSQUADID IS NOT NULL
        ) teams
        ORDER BY team_name
    """)

    external_teams = {}
    for row in cursor.fetchall():
        name = row[0]
        external_teams[name] = {
            'id': row[1],
            'type': row[2],
            'country_id': row[3],
            'country_name': row[4],
            'skillcorner_id': row[5],
            'heimspiel_id': row[6],
            'wyscout_id': row[7]
        }

    print(f"Loaded {len(external_teams)} external teams with metadata\n")

    # Get internal matches
    cursor.execute("""
        SELECT
            CAFC_MATCH_ID,
            HOMESQUADNAME,
            AWAYSQUADNAME,
            HOMESQUADID,
            AWAYSQUADID,
            DATE(SCHEDULEDDATE) as fixture_date
        FROM MATCHES
        WHERE DATA_SOURCE = 'internal'
        ORDER BY SCHEDULEDDATE DESC
    """)

    internal_matches = cursor.fetchall()
    print(f"Found {len(internal_matches)} internal matches\n")
    print("="*120)
    print("GENERATED SQL STATEMENTS")
    print("="*120)
    print()

    update_count = 0
    mapped_count = 0
    no_match_count = 0
    sql_statements = []
    unmatched_teams = set()

    for match in internal_matches:
        cafc_id, home_name, away_name, home_id, away_id, fixture_date = match

        home_metadata = None
        away_metadata = None
        needs_update = False
        home_mapped = False
        away_mapped = False

        # Check home team - exact match or mapping
        if not home_id:
            # Try exact match first
            if home_name in external_teams:
                home_metadata = external_teams[home_name]
                needs_update = True
            # Try manual mapping
            elif home_name in NAME_MAPPINGS:
                mapped_name = NAME_MAPPINGS[home_name]
                if mapped_name in external_teams:
                    home_metadata = external_teams[mapped_name]
                    home_mapped = True
                    mapped_count += 1
                    needs_update = True
            else:
                unmatched_teams.add(f"{home_name} (home)")

        # Check away team - exact match or mapping
        if not away_id:
            # Try exact match first
            if away_name in external_teams:
                away_metadata = external_teams[away_name]
                needs_update = True
            # Try manual mapping
            elif away_name in NAME_MAPPINGS:
                mapped_name = NAME_MAPPINGS[away_name]
                if mapped_name in external_teams:
                    away_metadata = external_teams[mapped_name]
                    away_mapped = True
                    mapped_count += 1
                    needs_update = True
            else:
                unmatched_teams.add(f"{away_name} (away)")

        if needs_update:
            update_count += 1

            # Generate UPDATE statement
            comment = f"-- Match {cafc_id}: {home_name} vs {away_name} ({fixture_date})"
            if home_mapped:
                comment += f"\n-- NOTE: '{home_name}' mapped to '{NAME_MAPPINGS[home_name]}'"
            if away_mapped:
                comment += f"\n-- NOTE: '{away_name}' mapped to '{NAME_MAPPINGS[away_name]}'"

            sql = comment + "\nUPDATE MATCHES\nSET "

            updates = []

            if home_metadata:
                # Update name if mapped
                if home_mapped:
                    updates.append(f"    HOMESQUADNAME = '{NAME_MAPPINGS[home_name]}'")
                updates.append(f"    HOMESQUADID = {home_metadata['id']}")
                if home_metadata['type']:
                    updates.append(f"    HOMESQUADTYPE = '{home_metadata['type']}'")
                if home_metadata['country_id']:
                    updates.append(f"    HOMESQUADCOUNTRYID = {home_metadata['country_id']}")
                if home_metadata['country_name']:
                    updates.append(f"    HOMESQUADCOUNTRYNAME = '{home_metadata['country_name']}'")
                if home_metadata['skillcorner_id']:
                    updates.append(f"    HOMESQUADSKILLCORNERID = {home_metadata['skillcorner_id']}")
                if home_metadata['heimspiel_id']:
                    updates.append(f"    HOMESQUADHEIMSPIELID = {home_metadata['heimspiel_id']}")
                if home_metadata['wyscout_id']:
                    updates.append(f"    HOMESQUADWYSCOUTID = {home_metadata['wyscout_id']}")

            if away_metadata:
                # Update name if mapped
                if away_mapped:
                    updates.append(f"    AWAYSQUADNAME = '{NAME_MAPPINGS[away_name]}'")
                updates.append(f"    AWAYSQUADID = {away_metadata['id']}")
                if away_metadata['type']:
                    updates.append(f"    AWAYSQUADTYPE = '{away_metadata['type']}'")
                if away_metadata['country_id']:
                    updates.append(f"    AWAYSQUADCOUNTRYID = {away_metadata['country_id']}")
                if away_metadata['country_name']:
                    updates.append(f"    AWAYSQUADCOUNTRYNAME = '{away_metadata['country_name']}'")
                if away_metadata['skillcorner_id']:
                    updates.append(f"    AWAYSQUADSKILLCORNERID = {away_metadata['skillcorner_id']}")
                if away_metadata['heimspiel_id']:
                    updates.append(f"    AWAYSQUADHEIMSPIELID = {away_metadata['heimspiel_id']}")
                if away_metadata['wyscout_id']:
                    updates.append(f"    AWAYSQUADWYSCOUTID = {away_metadata['wyscout_id']}")

            sql += ",\n".join(updates)
            sql += f"\nWHERE CAFC_MATCH_ID = {cafc_id} AND DATA_SOURCE = 'internal';\n"

            sql_statements.append(sql)
            print(sql)

    no_match_count = len(unmatched_teams)

    print("\n" + "="*120)
    print("SUMMARY")
    print("="*120)
    print(f"Total internal matches: {len(internal_matches)}")
    print(f"Matches updated: {update_count}")
    print(f"Teams mapped (name corrections): {mapped_count}")
    print(f"Teams with no match: {no_match_count}")
    print()
    print("Unmatched teams (youth/lower leagues - no external data available):")
    for team in sorted(unmatched_teams):
        print(f"  - {team}")
    print()
    print("INSTRUCTIONS:")
    print("1. Review the SQL statements above carefully")
    print("2. NOTE: Some team names will be corrected (e.g., 'Barnsley' → 'FC Barnsley')")
    print("3. Copy and paste into Snowflake console")
    print("4. Run them")
    print("5. Verify: SELECT * FROM MATCHES WHERE DATA_SOURCE = 'internal' AND HOMESQUADID IS NOT NULL")
    print()
    print("="*120)

    # Save to file
    output_file = Path(__file__).parent / 'backfill_squad_metadata_FINAL.sql'
    with open(output_file, 'w') as f:
        f.write("-- BACKFILL SQUAD METADATA FOR INTERNAL MATCHES (WITH NAME CORRECTIONS)\n")
        f.write("-- Generated with manual name mappings for close matches\n")
        f.write("-- " + "="*116 + "\n\n")
        for sql in sql_statements:
            f.write(sql)
            f.write("\n")

    print(f"✓ SQL statements saved to: {output_file}")
    print()

    cursor.close()
    conn.close()

if __name__ == "__main__":
    main()
