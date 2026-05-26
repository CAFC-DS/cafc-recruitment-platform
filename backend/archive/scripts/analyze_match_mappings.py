import snowflake.connector
import os
from dotenv import load_dotenv
from rapidfuzz import fuzz
from collections import defaultdict
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
print("ANALYZING INTERNAL MATCH TEAM NAMES")
print("=" * 100)

# Get all unique team names from internal matches
cursor.execute("""
    SELECT DISTINCT team_name
    FROM (
        SELECT HOMESQUADNAME as team_name
        FROM matches
        WHERE DATA_SOURCE = 'internal'
          AND HOMESQUADNAME IS NOT NULL
        UNION
        SELECT AWAYSQUADNAME as team_name
        FROM matches
        WHERE DATA_SOURCE = 'internal'
          AND AWAYSQUADNAME IS NOT NULL
    )
    ORDER BY team_name
""")
internal_teams = [row[0] for row in cursor.fetchall()]

print(f"\nFound {len(internal_teams)} unique team names in internal matches\n")

# Get all squads from external matches with their metadata
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
        FROM matches
        WHERE DATA_SOURCE = 'external'
          AND AWAYSQUADNAME IS NOT NULL
          AND AWAYSQUADID IS NOT NULL
    ) teams
    ORDER BY team_name
""")
external_squads = cursor.fetchall()

# Create a dictionary for easy lookup
external_squads_dict = {}
for row in external_squads:
    external_squads_dict[row[0]] = {
        'name': row[0],
        'id': row[1],
        'type': row[2],
        'countryId': row[3],
        'countryName': row[4],
        'skillCornerId': row[5],
        'heimspielId': row[6],
        'wyscoutId': row[7]
    }

print(f"Found {len(external_squads_dict)} unique squads in external matches\n")

# Analyze mappings
exact_matches = []
fuzzy_matches = []
no_matches = []

for internal_team in internal_teams:
    if internal_team in external_squads_dict:
        exact_matches.append((internal_team, external_squads_dict[internal_team]))
    else:
        # Try fuzzy matching
        best_match = None
        best_score = 0
        for external_team in external_squads_dict.keys():
            score = fuzz.ratio(internal_team.lower(), external_team.lower())
            if score > best_score:
                best_score = score
                best_match = external_team

        if best_score >= 85:  # High confidence threshold
            fuzzy_matches.append((internal_team, best_match, best_score, external_squads_dict[best_match]))
        else:
            no_matches.append(internal_team)

print("\n" + "=" * 100)
print(f"EXACT MATCHES ({len(exact_matches)})")
print("=" * 100)
for internal_team, squad_info in exact_matches:
    print(f"\n'{internal_team}' → Squad ID: {squad_info['id']}")
    print(f"  Type: {squad_info['type']}, Country: {squad_info['countryName']}")

print("\n" + "=" * 100)
print(f"FUZZY MATCHES (Score >= 85) ({len(fuzzy_matches)})")
print("=" * 100)
for internal_team, external_team, score, squad_info in fuzzy_matches:
    print(f"\n'{internal_team}' → '{external_team}' (Score: {score})")
    print(f"  Squad ID: {squad_info['id']}, Type: {squad_info['type']}, Country: {squad_info['countryName']}")

print("\n" + "=" * 100)
print(f"NO GOOD MATCHES ({len(no_matches)})")
print("=" * 100)
for team in no_matches:
    print(f"  - {team}")

# Now check for duplicate matches (internal matches that might already exist as external)
print("\n\n" + "=" * 100)
print("CHECKING FOR POTENTIAL DUPLICATE MATCHES")
print("=" * 100)

cursor.execute("""
    SELECT
        COALESCE(ID, CAFC_MATCH_ID) as match_id,
        HOMESQUADNAME,
        AWAYSQUADNAME,
        SCHEDULEDDATE,
        DATA_SOURCE
    FROM matches
    ORDER BY SCHEDULEDDATE DESC, HOMESQUADNAME
""")
all_matches = cursor.fetchall()

# Group by fixture date and teams
matches_by_key = defaultdict(list)
for match in all_matches:
    match_id, home, away, date, source = match
    # Create normalized key (sort teams to catch reversed home/away)
    teams = tuple(sorted([home.lower().strip() if home else '', away.lower().strip() if away else '']))
    key = (date, teams)
    matches_by_key[key].append({
        'id': match_id,
        'home': home,
        'away': away,
        'date': date,
        'source': source
    })

# Find potential duplicates
potential_duplicates = []
for key, matches in matches_by_key.items():
    if len(matches) > 1:
        # Check if there's both internal and external
        sources = [m['source'] for m in matches]
        if 'internal' in sources and 'external' in sources:
            potential_duplicates.append(matches)

if potential_duplicates:
    print(f"\nFound {len(potential_duplicates)} potential duplicate match groups:\n")
    for i, match_group in enumerate(potential_duplicates, 1):
        print(f"\nGroup {i}:")
        for match in match_group:
            print(f"  [{match['source'].upper()}] {match['home']} vs {match['away']} on {match['date']} (ID: {match['id']})")
else:
    print("\nNo exact duplicate matches found (same date, same teams, different sources)")

# Check for near-duplicates (same teams, dates within 7 days)
print("\n" + "=" * 100)
print("CHECKING FOR NEAR-DUPLICATE MATCHES (within 7 days)")
print("=" * 100)

from datetime import datetime, timedelta

cursor.execute("""
    SELECT
        COALESCE(ID, CAFC_MATCH_ID) as match_id,
        HOMESQUADNAME,
        AWAYSQUADNAME,
        SCHEDULEDDATE,
        DATA_SOURCE
    FROM matches
    WHERE DATA_SOURCE = 'internal'
    ORDER BY SCHEDULEDDATE DESC
""")
internal_matches = cursor.fetchall()

cursor.execute("""
    SELECT
        COALESCE(ID, CAFC_MATCH_ID) as match_id,
        HOMESQUADNAME,
        AWAYSQUADNAME,
        SCHEDULEDDATE,
        DATA_SOURCE
    FROM matches
    WHERE DATA_SOURCE = 'external'
    ORDER BY SCHEDULEDDATE DESC
""")
external_matches = cursor.fetchall()

near_duplicates = []
for int_match in internal_matches:
    int_id, int_home, int_away, int_date, _ = int_match

    # Skip if no date
    if not int_date:
        continue

    # Handle datetime objects or strings
    if isinstance(int_date, str):
        int_date_obj = datetime.strptime(int_date.split()[0], '%Y-%m-%d')
    else:
        int_date_obj = int_date

    for ext_match in external_matches:
        ext_id, ext_home, ext_away, ext_date, _ = ext_match

        # Skip if no date
        if not ext_date:
            continue

        # Handle datetime objects or strings
        if isinstance(ext_date, str):
            ext_date_obj = datetime.strptime(ext_date.split()[0], '%Y-%m-%d')
        else:
            ext_date_obj = ext_date

        # Check if dates are within 7 days
        if abs((int_date_obj - ext_date_obj).days) <= 7:
            # Check if teams match (with fuzzy matching)
            home_match = fuzz.ratio(int_home.lower(), ext_home.lower()) >= 85 or fuzz.ratio(int_home.lower(), ext_away.lower()) >= 85
            away_match = fuzz.ratio(int_away.lower(), ext_away.lower()) >= 85 or fuzz.ratio(int_away.lower(), ext_home.lower()) >= 85

            if home_match and away_match:
                near_duplicates.append({
                    'internal': {'id': int_id, 'home': int_home, 'away': int_away, 'date': int_date},
                    'external': {'id': ext_id, 'home': ext_home, 'away': ext_away, 'date': ext_date},
                    'date_diff': abs((int_date_obj - ext_date_obj).days)
                })

if near_duplicates:
    print(f"\nFound {len(near_duplicates)} potential near-duplicate matches:\n")
    for i, dup in enumerate(near_duplicates, 1):
        print(f"\nNear-duplicate {i} (Date difference: {dup['date_diff']} days):")
        print(f"  [INTERNAL] {dup['internal']['home']} vs {dup['internal']['away']} on {dup['internal']['date']} (ID: {dup['internal']['id']})")
        print(f"  [EXTERNAL] {dup['external']['home']} vs {dup['external']['away']} on {dup['external']['date']} (ID: {dup['external']['id']})")
else:
    print("\nNo near-duplicate matches found")

cursor.close()
conn.close()

print("\n" + "=" * 100)
print("ANALYSIS COMPLETE")
print("=" * 100)
