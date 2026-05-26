"""
Multiple Archived Reports Import Script - Import test reports for all grade levels.

This script imports 5 archived reports to test different grade colors:
- Outstanding/Above Level (Gold - 10)
- Target (Dark Green - 8)
- Monitor (Light Green - 6)
- Scout (Orange - 4)
- No Action (Dark Red - 2)

Usage:
    python import_multiple_archived_reports.py
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

# Test reports data - Multiple grades for testing
TEST_REPORTS = [
    {
        "report_id": 1098,
        "player": "Josh Bowler",
        "position": "RW - Direct Winger",
        "fixture": "Cardiff City 0-0 Blackburn Rovers",
        "report_date": "23/01/2025",
        "fixture_date": "20/02/2024",
        "strengths": """Pace/athleticism - quick and agile, good acceleration and has the pace to stretch away from his man once up to speed.
Movement without the ball - had a lot of success with give and go's, primarily underlapping to penetrate the top line. Also broke the top line with a couple of good runs beyond Etete. Makes double movements to create separation from his marker intelligently.
Ball-carrying - direct and drove with the ball well when afforded space.
Passing variation - achieved success with a wide range of passes, penetrating Blackburn over both short and long distances. Considerate with the weighting/detail on a couple of lofted passes over the top for teammates to run onto.
Aggression - often picked the right moments to jump out and press and was aggressive with any regain opportunities, forcing a couple of turnovers high up.""",
        "weaknesses": """Decision-making/final third quality - ineffective with his decision-making when it came to his final action. Displayed his usual eye for an intelligent pass although was just lacking the execution.
Defensive transitions - wasn't particularly committed with the majority of recovery runs on transition.
On the back foot - there were a couple of occasions where he was too passive when receiving the ball, waiting for it to arrive to his feet, allowing opponents to steal in.""",
        "summary": "An average showing overall, as he was unable to really leave his mark on the game. A good athlete, with no shortage of pace/agility when attacking 1 vs 1. Carries the ball well through the thirds and displays a good recognition of space. A creative player - wants to get on the ball and make things happen, with his wide passing variation allowing him to penetrate in a range of different ways. His decision-making with his final action wasn't up to the required standard however in this match. Was effective with his out of possession actions when defending from the front, being aggressive with regain opportunities to force mistakes. He does have a few defensive shortcomings however, most notably his lack of intensity with recovery runs on transition. Overall I believe that he improves our starting 11 and would be more than capable of adding numbers for us going forwards. Fits the profile of a Charlton Athletic direct winger and also possesses certain traits of an inverted winger. Wouldn't look out of place at the level above and should be an urgent target in my eyes.",
        "grade": "Outstanding/Above Level",
        "scout": "Thomas Evans",
        "vss_score": "24",
        "live_video": "Video"
    },
    {
        "report_id": 183,
        "player": "Ethan Galbraith",
        "position": "Full Back",
        "fixture": "Charlton Athletic 1-0 Leyton Orient",
        "report_date": "25/05/2025",
        "fixture_date": "25/05/2025",
        "strengths": """Versatility
+ Speed & Acceleration
+ Agility & Footwork
+ Pressing Aggression
+ Vision
+ Defensive Anticipation""",
        "weaknesses": "- Size",
        "summary": """Small with a lean build. Has put some muscle on since last seen. Played as a RB in a 4231 – rolled inside a few times and then moved there for last part of the second half. Linked midfield to attack and backed up play. Right footed but confident using his left. Communicated and organised – switched on type. Showed good speed on both sides of the ball. Agile in turns. Very calm. Good manipulation to beat tight pressure. Can step through pressure. Wants to play. Showed a good range. Little casual in short areas at times. Two crosses – one nice shape & one byline straight at GK. Reacted well to turnovers and own mistakes. Aggressive and front foot. Quick up to the ball to deny play. Short and spun early but showed good acceleration to get back in. First challenge wrong side but won it. Gets body across well. Sharp/quick feet to match wide. Swung round well, narrowed in and covered behind the line effectively. Tries to compete aerially – won a couple. Impressive display and a standout on the day. Makes up for size with his competitiveness and aggression defensively. Good speed and agility. Confident and calm on the ball – sees a pass & wants to play forward. Improves our group in several areas and still has room to improve.""",
        "grade": "Target",
        "scout": "Calvin Charlton",
        "vss_score": "28",
        "live_video": "Live"
    },
    {
        "report_id": 36,
        "player": "Jordan Gabriel",
        "position": "RB",
        "fixture": "Blackpool 1-1 Lincoln City",
        "report_date": "16/05/2025",
        "fixture_date": "01/10/2024",
        "strengths": """Pace - A fairly mobile player who got up and down the touch line very well, showing good pace when doing so. Was able to make the box well, looking to get on the end of crosses from the opposite side.
Movement - Often inverted, looked to play through the centre of the pitch. Made frequent forward runs, looking to receive the ball in the attacking half.
Defensive positioning - Positioned well defensively and made multiple interceptions, cutting out opposition attacks.
1v1 Defending - Good in ground duels and defended well 1v1.""",
        "weaknesses": """Passing - Was fairly inaccurate with his passing over both short and longer distances.
Chance creation - Gabriel had little success in terms of chance creation for himself or teammates, despite getting into attacking positions.""",
        "summary": "A fairly positive performance from Gabriel who was solid defensively in his side's 1-1 draw with Lincoln City. He was a mobile player who was able to get up and down the pitch effectively, consistently being an option in possession for his side. He often inverted, looked to play through central areas of the pitch. Gabriel made intelligent runs looking to be found by crosses on the opposite side. His chance creation was poor and had little impact in the final third. I think he would be much better suited as an outside centreback and could be a good option for our squad.",
        "grade": "Monitor",
        "scout": "Charlie Irwin",
        "vss_score": "0",
        "live_video": "Video"
    },
    {
        "report_id": 115,
        "player": "Sean McLoughlin",
        "position": "Full Back",
        "fixture": "Hull City 2-0 Plymouth Argyle",
        "report_date": "29/06/2025",
        "fixture_date": "04/03/2025",
        "strengths": """Physical Profile - 6"2 with an athletic frame. Showed good strength when defending, using his upper body strength to win the ball.
Defending in Wide Areas - McLoughlin came fairly wide to defend against the opposition winger and dealt with him throughout the game, showing good strength. In possession - Comfortable on the ball, looking to play out of defence. Defending the box - Dominant aerially to clear the ball out of the box. Strong in aerial duels.""",
        "weaknesses": """Passing - Was fairly poor when playing forward, especially with his long passing which was overall quite unsuccessful.
Going Forward - Offered little going forward and was a lot more of a defensive player, poor at crossing.""",
        "summary": """A defensively solid performance from McLoughlin as his side kept a clean sheet against Plymouth. He has a strong physical profile, standing at 6'2 and was dominant aerially, being a target in both boxes. Defensively McLoughlin was good especially in wide areas although he did lunge into challenges quite aggressively, which on another occasion could've seen him beaten 1v1. He could potentially be an option for outside centreback, and it would be interesting to view him in a back 3. Scout further.""",
        "grade": "Scout",
        "scout": "Charlie Irwin",
        "vss_score": "23",
        "live_video": "Video"
    },
    {
        "report_id": 72,
        "player": "Dane Scarlett",
        "position": "In Behind CF",
        "fixture": "Oxford United 1-0 Hull City",
        "report_date": "21/07/2025",
        "fixture_date": "05/11/2024",
        "strengths": "Pace, Physical profile",
        "weaknesses": "Link up play, Final third quality, Movement",
        "summary": """Athletic profile 5'11. Played at CF in a 4-2-3-1 formation. Right footed. A fast player who used his physicality effectively to challenge in ground duels. Scarlett provided little threat in the game, rarely touching the ball or getting involved in link up play. He did not manage a single shot in the game and was dealt with effectively by the opposition defensive line. A poor performance from Scarlett before being substituted on 71'. I don't feel he currently improves our squad, no action.""",
        "grade": "No Action",
        "scout": "Charlie Irwin",
        "vss_score": "22",
        "live_video": "Video"
    }
]


def get_private_key():
    """Load private key from file for authentication."""
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
    pkb = get_private_key()

    conn = snowflake.connector.connect(
        account=SNOWFLAKE_ACCOUNT,
        user=SNOWFLAKE_USER,
        role=SNOWFLAKE_ROLE,
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
            if score > 0.85:
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
    """Parse fixture string like 'Team A 0-0 Team B'."""
    match = re.match(r'^(.+?)\s+\d+-\d+\s+(.+)$', fixture_str.strip())
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return None, None


def find_fixture(cursor, fixture_str, fixture_date):
    """Find fixture by parsing team names and date."""
    print(f"Searching for fixture: {fixture_str} on {fixture_date}")

    home_team, away_team = parse_fixture(fixture_str)
    if not home_team or not away_team:
        print(f"✗ Could not parse fixture: {fixture_str}")
        return None

    print(f"  Parsed as: {home_team} vs {away_team}")

    try:
        date_obj = datetime.strptime(fixture_date, "%d/%m/%Y")
        formatted_date = date_obj.strftime("%Y-%m-%d")
    except ValueError:
        print(f"✗ Invalid date format: {fixture_date}")
        return None

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
        if result[5] == 'internal':
            match_id = result[1]
        else:
            match_id = result[0]
        print(f"✓ Found fixture: {result[2]} vs {result[3]} (Match ID: {match_id}, Source: {result[5]})")
        return match_id

    print(f"✗ Fixture not found in database")
    return None


def find_scout(cursor, scout_name):
    """Find scout by name and return user ID."""
    print(f"Searching for scout: {scout_name}")

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


def combine_content(strengths, weaknesses, summary, vss_score):
    """Combine strengths, weaknesses, and summary into formatted text."""
    parts = []

    if strengths and strengths.strip():
        parts.append(f"STRENGTHS:\n{strengths.strip()}")

    if weaknesses and weaknesses.strip():
        parts.append(f"WEAKNESSES:\n{weaknesses.strip()}")

    if summary and summary.strip():
        parts.append(f"SUMMARY:\n{summary.strip()}")

    if vss_score and vss_score.strip():
        parts.append(f"VSS SCORE:\n{vss_score.strip()}")

    return "\n\n".join(parts)


def create_flag_report(cursor, player, match_id, user_id, combined_summary,
                       flag_category, scouting_type, report_date, position="", is_archived=True):
    """Create Flag report in database using dual ID system."""
    print("Creating Flag report...")

    if player['data_source'] == 'internal':
        player_id = None
        cafc_player_id = player['cafc_player_id']
        print(f"  Using CAFC_PLAYER_ID: {cafc_player_id}")
    else:
        player_id = player['playerid']
        cafc_player_id = None
        print(f"  Using PLAYER_ID: {player_id}")

    print(f"  Grade: {flag_category}")
    print(f"  IS_ARCHIVED: {is_archived}")

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
            CREATED_AT,
            IS_ARCHIVED
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
    """

    cursor.execute(query, (
        user_id,
        player_id,
        cafc_player_id,
        match_id,
        "Flag",
        position,
        "",
        "",
        "",
        scouting_type,
        combined_summary,
        flag_category,
        report_date,
        is_archived,
    ))

    print("✓ Flag report created successfully!\n")


def main():
    """Main function to import multiple test reports."""
    print("="*80)
    print("MULTIPLE ARCHIVED REPORTS IMPORT - Testing All Grade Levels")
    print("="*80 + "\n")

    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        success_count = 0
        failed_count = 0

        for i, report in enumerate(TEST_REPORTS, 1):
            print(f"\n{'='*80}")
            print(f"REPORT {i}/{len(TEST_REPORTS)}: {report['player']} - Grade: {report['grade']}")
            print(f"{'='*80}\n")

            # Find player
            player = find_player(cursor, report["player"])
            if not player:
                print(f"✗ SKIPPING: Could not find player\n")
                failed_count += 1
                continue

            # Find fixture
            match_id = find_fixture(cursor, report["fixture"], report["fixture_date"])
            if not match_id:
                print(f"✗ SKIPPING: Could not find fixture\n")
                failed_count += 1
                continue

            # Find scout
            user_id = find_scout(cursor, report["scout"])
            if not user_id:
                print(f"✗ SKIPPING: Could not find scout\n")
                failed_count += 1
                continue

            # Combine content
            combined_summary = combine_content(
                report["strengths"],
                report["weaknesses"],
                report["summary"],
                report["vss_score"]
            )

            # Parse report date
            python_date = datetime.strptime(report["report_date"], "%d/%m/%Y")

            # Create report
            create_flag_report(
                cursor,
                player,
                match_id,
                user_id,
                combined_summary,
                report["grade"],
                report["live_video"],
                python_date,
                report["position"]
            )

            success_count += 1

        # Commit all changes
        conn.commit()

        print("\n" + "="*80)
        print(f"IMPORT COMPLETE: {success_count} successful, {failed_count} failed")
        print("="*80)

        cursor.close()
        conn.close()

    except Exception as e:
        print(f"\n✗ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
