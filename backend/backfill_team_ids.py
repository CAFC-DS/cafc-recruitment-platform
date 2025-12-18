"""
Backfill script to:
1. Identify and correct similar/duplicate team names in internal matches
2. Populate missing HOMESQUADID and AWAYSQUADID by matching to external matches

Usage: python backfill_team_ids.py [--dry-run] [--auto-approve-threshold N]
"""
import snowflake.connector
import os
from pathlib import Path
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from rapidfuzz import fuzz
import argparse

# Load .env from backend directory
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

# Snowflake connection parameters - Environment-Based
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

if ENVIRONMENT == "production":
    # Production: Use APP_USER with COMPUTE_WH
    SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_PROD_ACCOUNT")
    SNOWFLAKE_USER = os.getenv("SNOWFLAKE_PROD_USERNAME")
    SNOWFLAKE_ROLE = os.getenv("SNOWFLAKE_PROD_ROLE")
    SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_PROD_WAREHOUSE")
    SNOWFLAKE_DATABASE = os.getenv("SNOWFLAKE_PROD_DATABASE")
    SNOWFLAKE_SCHEMA = os.getenv("SNOWFLAKE_PROD_SCHEMA")
    SNOWFLAKE_PRIVATE_KEY_PATH = os.getenv("SNOWFLAKE_PROD_PRIVATE_KEY_PATH")
    print(f"🚀 PRODUCTION MODE: Using {SNOWFLAKE_USER} with {SNOWFLAKE_WAREHOUSE}")
else:
    # Development: Use personal account with DEVELOPMENT_WH
    SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_DEV_ACCOUNT", os.getenv("SNOWFLAKE_ACCOUNT"))
    SNOWFLAKE_USER = os.getenv("SNOWFLAKE_DEV_USERNAME", os.getenv("SNOWFLAKE_USERNAME"))
    SNOWFLAKE_ROLE = os.getenv("SNOWFLAKE_DEV_ROLE", "SYSADMIN")
    SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_DEV_WAREHOUSE", os.getenv("SNOWFLAKE_WAREHOUSE"))
    SNOWFLAKE_DATABASE = os.getenv("SNOWFLAKE_DEV_DATABASE", os.getenv("SNOWFLAKE_DATABASE"))
    SNOWFLAKE_SCHEMA = os.getenv("SNOWFLAKE_DEV_SCHEMA", os.getenv("SNOWFLAKE_SCHEMA"))
    SNOWFLAKE_PRIVATE_KEY_PATH = os.getenv("SNOWFLAKE_DEV_PRIVATE_KEY_PATH", os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH"))
    print(f"🔧 DEVELOPMENT MODE: Using {SNOWFLAKE_USER} with {SNOWFLAKE_WAREHOUSE}")

def get_private_key():
    """Load private key from file"""
    private_key_path = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")
    with open(private_key_path, "rb") as key:
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
    return pkb

def get_snowflake_connection():
    pkb = get_private_key()

    return snowflake.connector.connect(
        user=SNOWFLAKE_USER,
        account=SNOWFLAKE_ACCOUNT,
        role=SNOWFLAKE_ROLE,
        warehouse=SNOWFLAKE_WAREHOUSE,
        database=SNOWFLAKE_DATABASE,
        schema=SNOWFLAKE_SCHEMA,
        private_key=pkb,
        client_session_keep_alive=True,
    )

def get_external_teams(cursor):
    """Get all unique teams from external matches with their IDs and metadata"""
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

    teams = {}
    for row in cursor.fetchall():
        name = row[0]
        teams[name] = {
            'id': row[1],
            'type': row[2],
            'country_id': row[3],
            'country_name': row[4],
            'skillcorner_id': row[5],
            'heimspiel_id': row[6],
            'wyscout_id': row[7]
        }
    return teams

def get_internal_matches(cursor):
    """Get all internal matches with their team names"""
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

    return cursor.fetchall()

def find_best_match(team_name, external_teams, threshold=85):
    """Find the best matching external team using fuzzy matching"""
    if not team_name:
        return None, 0

    best_match = None
    best_score = 0

    for ext_team in external_teams.keys():
        # Use token_sort_ratio for better handling of word order differences
        score = fuzz.token_sort_ratio(team_name.lower(), ext_team.lower())

        if score > best_score:
            best_score = score
            best_match = ext_team

    if best_score >= threshold:
        return best_match, best_score
    return None, best_score

def main():
    parser = argparse.ArgumentParser(description='Backfill team IDs and correct team names')
    parser.add_argument('--dry-run', action='store_true',
                       help='Show what would be updated without making changes')
    parser.add_argument('--auto-approve-threshold', type=int, default=95,
                       help='Auto-approve matches above this threshold (default: 95)')
    args = parser.parse_args()

    conn = get_snowflake_connection()
    cursor = conn.cursor()

    print("\n" + "="*100)
    print("TEAM NAME CORRECTION AND ID BACKFILL SCRIPT")
    print("="*100)

    # Get reference data
    print("\n1. Fetching external teams with IDs...")
    external_teams = get_external_teams(cursor)
    print(f"   Found {len(external_teams)} unique teams in external data")

    print("\n2. Fetching internal matches...")
    internal_matches = get_internal_matches(cursor)
    print(f"   Found {len(internal_matches)} internal matches")

    # Analyze matches and build update plan
    updates = []
    no_match_found = []

    print("\n3. Analyzing matches and finding best matches...")
    print("="*100)

    for match in internal_matches:
        cafc_id, home_name, away_name, home_id, away_id, date = match

        needs_update = False
        update_data = {
            'cafc_id': cafc_id,
            'date': date,
            'original_home': home_name,
            'original_away': away_name,
            'new_home': home_name,
            'new_away': away_name,
            'home_id': home_id,
            'away_id': away_id,
            'home_match_score': 0,
            'away_match_score': 0,
        }

        # Check home team
        if home_name and (not home_id or home_name not in external_teams):
            best_match, score = find_best_match(home_name, external_teams)
            if best_match:
                team_metadata = external_teams[best_match]
                update_data['new_home'] = best_match
                update_data['home_id'] = team_metadata['id']
                update_data['home_type'] = team_metadata['type']
                update_data['home_country_id'] = team_metadata['country_id']
                update_data['home_country_name'] = team_metadata['country_name']
                update_data['home_skillcorner_id'] = team_metadata['skillcorner_id']
                update_data['home_heimspiel_id'] = team_metadata['heimspiel_id']
                update_data['home_wyscout_id'] = team_metadata['wyscout_id']
                update_data['home_match_score'] = score
                needs_update = True
            else:
                no_match_found.append((cafc_id, 'home', home_name, score))

        # Check away team
        if away_name and (not away_id or away_name not in external_teams):
            best_match, score = find_best_match(away_name, external_teams)
            if best_match:
                team_metadata = external_teams[best_match]
                update_data['new_away'] = best_match
                update_data['away_id'] = team_metadata['id']
                update_data['away_type'] = team_metadata['type']
                update_data['away_country_id'] = team_metadata['country_id']
                update_data['away_country_name'] = team_metadata['country_name']
                update_data['away_skillcorner_id'] = team_metadata['skillcorner_id']
                update_data['away_heimspiel_id'] = team_metadata['heimspiel_id']
                update_data['away_wyscout_id'] = team_metadata['wyscout_id']
                update_data['away_match_score'] = score
                needs_update = True
            else:
                no_match_found.append((cafc_id, 'away', away_name, score))

        if needs_update:
            updates.append(update_data)

    # Display results
    print(f"\n4. Found {len(updates)} matches that need updates")
    print("="*100)

    if updates:
        print("\nProposed Updates:")
        print("-"*100)
        auto_approved = []
        needs_review = []

        for i, update in enumerate(updates, 1):
            print(f"\n[{i}] Match ID: {update['cafc_id']} | Date: {update['date']}")

            if update['original_home'] != update['new_home']:
                print(f"    Home: '{update['original_home']}' → '{update['new_home']}' (Score: {update['home_match_score']}%)")
                print(f"          ID: {update['home_id']}")
            else:
                print(f"    Home: '{update['new_home']}' (ID backfill only: {update['home_id']})")

            if update['original_away'] != update['new_away']:
                print(f"    Away: '{update['original_away']}' → '{update['new_away']}' (Score: {update['away_match_score']}%)")
                print(f"          ID: {update['away_id']}")
            else:
                print(f"    Away: '{update['new_away']}' (ID backfill only: {update['away_id']})")

            # Determine if auto-approve
            min_score = min(update['home_match_score'] or 100, update['away_match_score'] or 100)
            if min_score >= args.auto_approve_threshold:
                print(f"    ✓ AUTO-APPROVED (threshold: {args.auto_approve_threshold}%)")
                auto_approved.append(update)
            else:
                print(f"    ⚠ NEEDS REVIEW")
                needs_review.append(update)

    if no_match_found:
        print(f"\n5. Teams with NO good matches found ({len(no_match_found)}):")
        print("-"*100)
        for cafc_id, position, team_name, best_score in no_match_found:
            print(f"   Match {cafc_id} | {position}: '{team_name}' (best score: {best_score}%)")

    # Execute updates
    if updates and not args.dry_run:
        print("\n" + "="*100)
        print("EXECUTING UPDATES")
        print("="*100)

        to_update = auto_approved if needs_review else updates

        if needs_review:
            print(f"\nAuto-approving {len(auto_approved)} high-confidence matches...")
            print(f"{len(needs_review)} matches need manual review (run without --auto-approve-threshold to update all)")

        for update in to_update:
            try:
                cursor.execute("""
                    UPDATE MATCHES
                    SET HOMESQUADNAME = %s,
                        AWAYSQUADNAME = %s,
                        HOMESQUADID = %s,
                        AWAYSQUADID = %s,
                        HOMESQUADTYPE = %s,
                        AWAYSQUADTYPE = %s,
                        HOMESQUADCOUNTRYID = %s,
                        AWAYSQUADCOUNTRYID = %s,
                        HOMESQUADCOUNTRYNAME = %s,
                        AWAYSQUADCOUNTRYNAME = %s,
                        HOMESQUADSKILLCORNERID = %s,
                        AWAYSQUADSKILLCORNERID = %s,
                        HOMESQUADHEIMSPIELID = %s,
                        AWAYSQUADHEIMSPIELID = %s,
                        HOMESQUADWYSCOUTID = %s,
                        AWAYSQUADWYSCOUTID = %s
                    WHERE CAFC_MATCH_ID = %s AND DATA_SOURCE = 'internal'
                """, (
                    update['new_home'],
                    update['new_away'],
                    update['home_id'],
                    update['away_id'],
                    update.get('home_type'),
                    update.get('away_type'),
                    update.get('home_country_id'),
                    update.get('away_country_id'),
                    update.get('home_country_name'),
                    update.get('away_country_name'),
                    update.get('home_skillcorner_id'),
                    update.get('away_skillcorner_id'),
                    update.get('home_heimspiel_id'),
                    update.get('away_heimspiel_id'),
                    update.get('home_wyscout_id'),
                    update.get('away_wyscout_id'),
                    update['cafc_id']
                ))
                print(f"✓ Updated match {update['cafc_id']}")
            except Exception as e:
                print(f"✗ Error updating match {update['cafc_id']}: {e}")

        conn.commit()
        print(f"\n✓ Successfully updated {len(to_update)} matches")

    elif args.dry_run:
        print("\n" + "="*100)
        print("DRY RUN - No changes made")
        print("="*100)
        print(f"\nWould update {len(auto_approved)} auto-approved matches")
        print(f"{len(needs_review)} matches would need manual review")

    cursor.close()
    conn.close()

    print("\n" + "="*100)
    print("SCRIPT COMPLETE")
    print("="*100 + "\n")

if __name__ == "__main__":
    main()
