"""
Single Report Import Script - Test importing one old scout report as a Flag report.

This script imports the Kamari Doyle report as a test to verify the import process works.

Usage:
    python import_single_old_report.py
"""

import snowflake.connector
import os
from datetime import datetime
import re
from difflib import SequenceMatcher
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

# Load environment variables from .env file
load_dotenv()

# Snowflake connection parameters from environment
SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT")
SNOWFLAKE_USER = os.getenv("SNOWFLAKE_USERNAME")  # Note: .env uses SNOWFLAKE_USERNAME
SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE")
SNOWFLAKE_DATABASE = os.getenv("SNOWFLAKE_DATABASE")
SNOWFLAKE_SCHEMA = os.getenv("SNOWFLAKE_SCHEMA")
SNOWFLAKE_PRIVATE_KEY_PATH = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")

# Test report data - Kamari Doyle
TEST_REPORT = {
    "report_id": 755,
    "player": "Kamari Doyle",
    "fixture": "Rotherham 0-4 Crawley Town",
    "report_date": "04/04/2025",
    "fixture_date": "29/03/2025",
    "strengths": """Technique- set pieces throughout the game were taking with pace and precision. He could also take them with either foot which is very unique. His strike of the ball is great, scoring a difficult shot from outside of the box putting a lot of curl on the ball and scoring a powerful low driven shot, displaying his range of clinical finishing.
 Receiving in pockets- his off the ball movement was superb, always moving into pockets of space. Had good awareness, knew when to play quick passes or when to turn into space.
 Work rate- I think his work rate as a 10 was something to mention also. Did his part in tracking back and pressing from the front also. Was a very balanced 10.""",
    "weaknesses": "Physicality- wasn't very strong in holding off opponents or going into duels. This could sometimes affect his ball carrying ability, but getting regular professional minutes should help him develop well and at his age this should only improve.",
    "summary": "A brilliant performance and definitely the man of the match. Technically gifted and well balanced 10. He looked really comfortable at the league 1 level for a 19 year old. Also the fact he's already got good/valuable minutes at this level, I would seriously recommend him as a 10 next season if available. I think his current ability and potential is, for sure, outstanding.",
    "grade": "Outstanding/Above Level",
    "scout": "Elliot Young",
    "vss_score": 30,
    "live_video": "Video"
}


def get_private_key():
    """Load private key from file for authentication."""
    # Get absolute path relative to this script's directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    key_path = os.path.join(script_dir, SNOWFLAKE_PRIVATE_KEY_PATH)

    with open(key_path, "rb") as key:
        p_key = serialization.load_pem_private_key(
            key.read(),
            password=None,
            backend=default_backend()
        )

    return p_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


def get_snowflake_connection():
    """Create and return a Snowflake connection using private key authentication."""
    print("Connecting to Snowflake...")

    # Load private key
    pkb = get_private_key()

    conn = snowflake.connector.connect(
        account=SNOWFLAKE_ACCOUNT,
        user=SNOWFLAKE_USER,
        warehouse=SNOWFLAKE_WAREHOUSE,
        database=SNOWFLAKE_DATABASE,
        schema=SNOWFLAKE_SCHEMA,
        private_key=pkb
    )
    print("✓ Connected to Snowflake\n")
    return conn


def normalize_name(name):
    """Normalize name for fuzzy matching."""
    return re.sub(r'[^a-z0-9]', '', name.lower().strip())


def similarity_score(str1, str2):
    """Calculate similarity score between two strings."""
    return SequenceMatcher(None, str1, str2).ratio()


def find_player(cursor, player_name):
    """Find player by name with fuzzy matching."""
    print(f"Searching for player: {player_name}")

    # Try exact match first
    query = """
        SELECT PLAYERID, CAFC_PLAYER_ID, PLAYERNAME, SQUADNAME, POSITION, DATA_SOURCE
        FROM PLAYERS
        WHERE UPPER(PLAYERNAME) = UPPER(%s)
        LIMIT 1
    """
    cursor.execute(query, (player_name,))
    result = cursor.fetchone()

    if result:
        print(f"✓ Found exact match: {result[2]} (Team: {result[3]}, Source: {result[5]})")
        return {
            "playerid": result[0],
            "cafc_player_id": result[1],
            "player_name": result[2],
            "squad_name": result[3],
            "position": result[4],
            "data_source": result[5]
        }

    # Try fuzzy match
    print("  No exact match, trying fuzzy matching...")
    query = "SELECT PLAYERID, CAFC_PLAYER_ID, PLAYERNAME, SQUADNAME, POSITION, DATA_SOURCE FROM PLAYERS"
    cursor.execute(query)
    all_players = cursor.fetchall()

    normalized_search = normalize_name(player_name)
    best_match = None
    best_score = 0.0

    for player in all_players:
        normalized_player = normalize_name(player[2])
        score = similarity_score(normalized_search, normalized_player)
        if score > best_score:
            best_score = score
            if score > 0.85:  # 85% similarity threshold
                best_match = {
                    "playerid": player[0],
                    "cafc_player_id": player[1],
                    "player_name": player[2],
                    "squad_name": player[3],
                    "position": player[4],
                    "data_source": player[5]
                }

    if best_match:
        print(f"✓ Found fuzzy match: {best_match['player_name']} (Team: {best_match['squad_name']}, "
              f"Similarity: {best_score:.2%})")
        return best_match

    print(f"✗ Player not found: {player_name}")
    return None


def parse_fixture(fixture_str):
    """Parse fixture string like 'Rotherham 0-4 Crawley Town'."""
    # Pattern: "Team A 0-0 Team B"
    match = re.match(r'^(.+?)\s+\d+-\d+\s+(.+)$', fixture_str.strip())
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return None, None


def find_fixture(cursor, fixture_str, fixture_date):
    """Find fixture by parsing team names and date."""
    print(f"Searching for fixture: {fixture_str} on {fixture_date}")

    # Parse teams
    home_team, away_team = parse_fixture(fixture_str)
    if not home_team or not away_team:
        print(f"✗ Could not parse fixture: {fixture_str}")
        return None

    print(f"  Parsed as: {home_team} vs {away_team}")

    # Convert date format
    try:
        date_obj = datetime.strptime(fixture_date, "%d/%m/%Y")
        formatted_date = date_obj.strftime("%Y-%m-%d")
    except ValueError:
        print(f"✗ Invalid date format: {fixture_date}")
        return None

    # Search for fixture in MATCHES table
    query = """
        SELECT ID, CAFC_MATCH_ID, HOMESQUADNAME, AWAYSQUADNAME, SCHEDULEDDATE, DATA_SOURCE
        FROM MATCHES
        WHERE (
            UPPER(HOMESQUADNAME) LIKE UPPER(%s) OR UPPER(HOMESQUADNAME) LIKE UPPER(%s)
        ) AND (
            UPPER(AWAYSQUADNAME) LIKE UPPER(%s) OR UPPER(AWAYSQUADNAME) LIKE UPPER(%s)
        ) AND DATE(SCHEDULEDDATE) = %s
        LIMIT 1
    """

    home_like = f"%{home_team}%"
    away_like = f"%{away_team}%"

    cursor.execute(query, (home_like, away_like, away_like, home_like, formatted_date))
    result = cursor.fetchone()

    if result:
        # Return match_id based on data source
        if result[5] == 'internal':
            match_id = result[1]  # CAFC_MATCH_ID
        else:
            match_id = result[0]  # ID
        print(f"✓ Found fixture: {result[2]} vs {result[3]} (Match ID: {match_id}, Source: {result[5]})")
        return match_id

    print(f"✗ Fixture not found in database")
    return None


def find_scout(cursor, scout_name):
    """Find scout by name and return user ID."""
    print(f"Searching for scout: {scout_name}")

    # Try matching by FIRSTNAME + LASTNAME concatenated
    query = """
        SELECT ID, USERNAME, FIRSTNAME, LASTNAME
        FROM USERS
        WHERE UPPER(FIRSTNAME || ' ' || LASTNAME) = UPPER(%s)
        LIMIT 1
    """
    cursor.execute(query, (scout_name,))
    result = cursor.fetchone()

    if result:
        print(f"✓ Found scout: {result[2]} {result[3]} (ID: {result[0]}, Username: {result[1]})")
        return result[0]

    # Try matching by USERNAME
    query = """
        SELECT ID, USERNAME
        FROM USERS
        WHERE UPPER(USERNAME) = UPPER(%s)
        LIMIT 1
    """
    cursor.execute(query, (scout_name,))
    result = cursor.fetchone()

    if result:
        print(f"✓ Found scout by username: {result[1]} (ID: {result[0]})")
        return result[0]

    print(f"✗ Scout not found: {scout_name}")
    return None


def combine_content(strengths, weaknesses, summary):
    """Combine strengths, weaknesses, and summary into formatted text."""
    parts = []

    if strengths and strengths.strip():
        parts.append(f"STRENGTHS:\n{strengths.strip()}")

    if weaknesses and weaknesses.strip():
        parts.append(f"WEAKNESSES:\n{weaknesses.strip()}")

    if summary and summary.strip():
        parts.append(f"SUMMARY:\n{summary.strip()}")

    return "\n\n".join(parts)


def create_flag_report(cursor, player, match_id, user_id, combined_summary,
                       flag_category, scouting_type, position=""):
    """Create Flag report in database using dual ID system."""
    print("\nCreating Flag report...")

    # Determine which player ID column to use based on data source
    if player['data_source'] == 'internal':
        player_id = None
        cafc_player_id = player['cafc_player_id']
        print(f"  Using CAFC_PLAYER_ID: {cafc_player_id}")
    else:
        player_id = player['playerid']
        cafc_player_id = None
        print(f"  Using PLAYER_ID: {player_id}")

    query = """
        INSERT INTO SCOUT_REPORTS (
            USER_ID,
            PLAYER_ID,
            CAFC_PLAYER_ID,
            MATCH_ID,
            REPORT_TYPE,
            POSITION,
            FORMATION,
            BUILD,
            HEIGHT,
            SCOUTING_TYPE,
            SUMMARY,
            FLAG_CATEGORY,
            CREATED_AT
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
    """

    cursor.execute(query, (
        user_id,
        player_id,
        cafc_player_id,
        match_id,
        "Flag",
        position,
        "",  # formation - blank
        "",  # build - blank
        "",  # height - blank
        scouting_type,
        combined_summary,
        flag_category,
        datetime.now()
    ))

    print("✓ Flag report created successfully!")


def main():
    """Main function to import single test report."""
    print("="*80)
    print("SINGLE REPORT IMPORT TEST - Kamari Doyle")
    print("="*80 + "\n")

    try:
        # Connect to database
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        # Find player
        player = find_player(cursor, TEST_REPORT["player"])
        if not player:
            print("\n✗ FAILED: Could not find player")
            return

        print()

        # Find fixture
        match_id = find_fixture(cursor, TEST_REPORT["fixture"], TEST_REPORT["fixture_date"])
        if not match_id:
            print("\n✗ FAILED: Could not find fixture")
            return

        print()

        # Find scout
        user_id = find_scout(cursor, TEST_REPORT["scout"])
        if not user_id:
            print("\n✗ FAILED: Could not find scout")
            return

        print()

        # Combine content
        print("Combining report content...")
        combined_summary = combine_content(
            TEST_REPORT["strengths"],
            TEST_REPORT["weaknesses"],
            TEST_REPORT["summary"]
        )
        print(f"✓ Combined summary length: {len(combined_summary)} characters")

        # Create flag report
        create_flag_report(
            cursor,
            player,
            match_id,
            user_id,
            combined_summary,
            TEST_REPORT["grade"],
            TEST_REPORT["live_video"],
            player.get("position", "")
        )

        # Commit transaction
        conn.commit()

        print("\n" + "="*80)
        print("✓ SUCCESS: Report imported successfully!")
        print("="*80)

        # Close connection
        cursor.close()
        conn.close()

    except Exception as e:
        print(f"\n✗ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
