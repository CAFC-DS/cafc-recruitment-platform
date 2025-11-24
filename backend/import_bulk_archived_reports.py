"""
Bulk Import Script for Archived Reports

This script imports multiple archived scout reports from Excel files.
- Only imports reports where player, fixture, and scout all match
- Skips failures and continues processing
- Generates detailed logs for successes and failures
- Batch processing for performance

Usage:
    python import_bulk_archived_reports.py
"""

import snowflake.connector
import os
import pandas as pd
from datetime import datetime
import re
from difflib import SequenceMatcher
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from pathlib import Path
import csv
import unicodedata

# Load environment variables from .env file
load_dotenv()

# Snowflake connection parameters from environment
SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT")
SNOWFLAKE_USER = os.getenv("SNOWFLAKE_USERNAME")
SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE")
SNOWFLAKE_DATABASE = os.getenv("SNOWFLAKE_DATABASE")
SNOWFLAKE_SCHEMA = os.getenv("SNOWFLAKE_SCHEMA")
SNOWFLAKE_PRIVATE_KEY_PATH = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")

# Excel file path
EXCEL_FILE = "/Users/hashim.umarji/Downloads/Master Scout Reports (2).xlsx"

# Batch size for inserts
BATCH_SIZE = 100

# Fuzzy matching performance configuration
ENABLE_FUZZY_MATCHING = True       # Set to False to disable fuzzy matching entirely
MAX_FIXTURES_FOR_FUZZY = 100       # Skip fuzzy matching if more fixtures than this on a date
MAX_FUZZY_CANDIDATES = 50          # Maximum fixtures to check during fuzzy matching
FUZZY_THRESHOLD = 0.85             # Similarity threshold for fuzzy matching (85%)


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
        warehouse=SNOWFLAKE_WAREHOUSE,
        database=SNOWFLAKE_DATABASE,
        schema=SNOWFLAKE_SCHEMA,
        private_key=pkb
    )
    print("✓ Connected to Snowflake\n")
    return conn


def normalize_name(name):
    """Normalize name for fuzzy matching."""
    if pd.isna(name):
        return ""
    return re.sub(r'[^a-z0-9]', '', str(name).lower().strip())


def similarity_score(str1, str2):
    """Calculate similarity score between two strings."""
    return SequenceMatcher(None, str1, str2).ratio()


def normalize_unicode(text):
    """Normalize unicode characters (remove accents, umlauts, etc.)."""
    if not text:
        return ""
    # NFD = Canonical Decomposition, separates base characters from diacritics
    nfd = unicodedata.normalize('NFD', text)
    # Keep only characters that are not combining diacritical marks
    return ''.join([c for c in nfd if unicodedata.category(c) != 'Mn'])


def find_player(cursor, player_name, all_players_cache):
    """Find player by name with fuzzy matching."""
    if not player_name or pd.isna(player_name):
        return None, "Empty player name"

    player_name = str(player_name).strip()

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
        return {
            "playerid": result[0],
            "cafc_player_id": result[1],
            "player_name": result[2],
            "squad_name": result[3],
            "position": result[4],
            "data_source": result[5]
        }, None

    # Try fuzzy match
    normalized_search = normalize_name(player_name)
    best_match = None
    best_score = 0.0

    for player in all_players_cache:
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
        return best_match, None

    return None, f"Player not found: {player_name}"


def normalize_team_name(team_name):
    """Normalize team name by removing common affixes, unicode, and extra spaces."""
    if not team_name:
        return []

    # First normalize unicode (ü → u, é → e, etc.)
    team_name = normalize_unicode(team_name)

    # Remove extra spaces and convert to uppercase for comparison
    normalized = ' '.join(team_name.strip().upper().split())

    # Common prefixes to try removing (added SK for Slovak/Czech clubs)
    prefixes = ['FC ', 'AFC ', 'CF ', 'SC ', 'SK ', 'AC ', 'AS ', 'RC ', 'FK ']
    # Common suffixes to try removing
    suffixes = [' FC', ' AFC', ' CF', ' SC', ' SK', ' AC', ' AS', ' RC', ' FK',
                ' UNITED', ' CITY', ' TOWN', ' ATHLETIC', ' WANDERERS']

    # Create variations: original, without prefix, without suffix, without both
    variations = [normalized]

    for prefix in prefixes:
        if normalized.startswith(prefix):
            variations.append(normalized[len(prefix):])

    for suffix in suffixes:
        if normalized.endswith(suffix):
            variations.append(normalized[:-len(suffix)])

    return variations


def parse_fixture(fixture_str):
    """Parse fixture string in multiple formats."""
    if not fixture_str or pd.isna(fixture_str):
        return None, None

    fixture_str = str(fixture_str).strip()

    # Try format: "Team A 0-1 Team B" (dash score)
    match = re.match(r'^(.+?)\s+\d+-\d+\s+(.+)$', fixture_str)
    if match:
        return match.group(1).strip(), match.group(2).strip()

    # Try format: "Team A 0:1 Team B" (colon score)
    match = re.match(r'^(.+?)\s+\d+:\d+\s+(.+)$', fixture_str)
    if match:
        return match.group(1).strip(), match.group(2).strip()

    # Try format: "Team A - Team B" (no score)
    match = re.match(r'^(.+?)\s+-\s+(.+)$', fixture_str)
    if match:
        return match.group(1).strip(), match.group(2).strip()

    # Try format: "Team A vs Team B" or "Team A v Team B"
    match = re.match(r'^(.+?)\s+v[s]?\s+(.+)$', fixture_str, re.IGNORECASE)
    if match:
        return match.group(1).strip(), match.group(2).strip()

    return None, None


def find_fixture(cursor, fixture_str, fixture_date, fuzzy_match_log=None):
    """Find fixture by parsing team names and date with two-phase matching."""
    if not fixture_str or pd.isna(fixture_str):
        return None, "Empty fixture"

    if not fixture_date or pd.isna(fixture_date):
        return None, "Empty fixture date"

    # Parse teams
    home_team, away_team = parse_fixture(fixture_str)
    if not home_team or not away_team:
        return None, f"Could not parse fixture: {fixture_str}"

    # Convert date format
    try:
        if isinstance(fixture_date, str):
            date_obj = datetime.strptime(fixture_date, "%d/%m/%Y")
        else:
            date_obj = fixture_date
        formatted_date = date_obj.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return None, f"Invalid date format: {fixture_date}"

    # PHASE 1: Try exact LIKE matching with team name variations
    home_variations = normalize_team_name(home_team)
    away_variations = normalize_team_name(away_team)

    # Try matching with each combination of variations
    for home_var in home_variations:
        for away_var in away_variations:
            # Search for fixture in MATCHES table
            query = """
                SELECT ID, CAFC_MATCH_ID, HOMESQUADNAME, AWAYSQUADNAME, DATA_SOURCE
                FROM MATCHES
                WHERE (
                    UPPER(HOMESQUADNAME) LIKE UPPER(%s) OR UPPER(HOMESQUADNAME) LIKE UPPER(%s)
                ) AND (
                    UPPER(AWAYSQUADNAME) LIKE UPPER(%s) OR UPPER(AWAYSQUADNAME) LIKE UPPER(%s)
                ) AND DATE(SCHEDULEDDATE) = %s
                LIMIT 1
            """

            home_like = f"%{home_var}%"
            away_like = f"%{away_var}%"

            cursor.execute(query, (home_like, away_like, away_like, home_like, formatted_date))
            result = cursor.fetchone()

            if result:
                # Found exact match!
                if result[4] == 'internal':
                    match_id = result[1]  # CAFC_MATCH_ID
                else:
                    match_id = result[0]  # ID
                return match_id, None

    # PHASE 2: Try fuzzy matching if exact matching failed
    if not ENABLE_FUZZY_MATCHING:
        return None, f"Fixture not found (fuzzy matching disabled): {fixture_str} on {formatted_date}"

    # First, count how many fixtures exist on this date
    count_query = "SELECT COUNT(*) FROM MATCHES WHERE DATE(SCHEDULEDDATE) = %s"
    cursor.execute(count_query, (formatted_date,))
    fixture_count = cursor.fetchone()[0]

    if fixture_count == 0:
        return None, f"No fixtures found on {formatted_date}"

    # Skip fuzzy matching if too many fixtures on this date (performance optimization)
    if fixture_count > MAX_FIXTURES_FOR_FUZZY:
        return None, f"Too many fixtures on {formatted_date} ({fixture_count} fixtures) - skipping fuzzy match"

    # Get fixtures (with optional LIMIT for large result sets)
    limit_clause = f"LIMIT {MAX_FUZZY_CANDIDATES}" if fixture_count > MAX_FUZZY_CANDIDATES else ""
    query = f"""
        SELECT ID, CAFC_MATCH_ID, HOMESQUADNAME, AWAYSQUADNAME, DATA_SOURCE
        FROM MATCHES
        WHERE DATE(SCHEDULEDDATE) = %s
        {limit_clause}
    """
    cursor.execute(query, (formatted_date,))
    all_fixtures = cursor.fetchall()

    # Normalize search teams for fuzzy matching
    home_normalized = normalize_unicode(home_team).upper().strip()
    away_normalized = normalize_unicode(away_team).upper().strip()

    # Try fuzzy matching with high threshold
    best_match = None
    best_score = 0.0

    for fixture in all_fixtures:
        db_home = normalize_unicode(fixture[2]).upper().strip()
        db_away = normalize_unicode(fixture[3]).upper().strip()

        # Calculate similarity scores (both directions for home/away swap)
        home_score = similarity_score(home_normalized, db_home)
        away_score = similarity_score(away_normalized, db_away)
        avg_score = (home_score + away_score) / 2

        # Also try swapped (in case home/away are reversed)
        home_score_swap = similarity_score(home_normalized, db_away)
        away_score_swap = similarity_score(away_normalized, db_home)
        avg_score_swap = (home_score_swap + away_score_swap) / 2

        final_score = max(avg_score, avg_score_swap)

        if final_score > best_score and final_score >= FUZZY_THRESHOLD:
            best_score = final_score
            best_match = fixture

    if best_match:
        # Log fuzzy match
        if fuzzy_match_log is not None:
            log_entry = {
                'search': f"{home_team} vs {away_team}",
                'matched': f"{best_match[2]} vs {best_match[3]}",
                'date': formatted_date,
                'similarity': f"{best_score:.2%}"
            }
            fuzzy_match_log.append(log_entry)

        if best_match[4] == 'internal':
            match_id = best_match[1]  # CAFC_MATCH_ID
        else:
            match_id = best_match[0]  # ID
        return match_id, None

    return None, f"Fixture not found: {fixture_str} on {formatted_date}"


def find_scout(cursor, scout_name, all_scouts_cache):
    """Find scout by name and return user ID."""
    if not scout_name or pd.isna(scout_name):
        return None, "Empty scout name"

    scout_name = str(scout_name).strip()

    # Try matching by FIRSTNAME + LASTNAME
    for user in all_scouts_cache:
        full_name = f"{user[2]} {user[3]}".strip().upper()
        if full_name == scout_name.upper():
            return user[0], None

    # Try matching by USERNAME
    for user in all_scouts_cache:
        if user[1].upper() == scout_name.upper():
            return user[0], None

    return None, f"Scout not found: {scout_name}"


def combine_content(strengths, weaknesses, summary, vss_score):
    """Combine strengths, weaknesses, summary, and VSS score into formatted text."""
    parts = []

    if strengths and not pd.isna(strengths) and str(strengths).strip():
        parts.append(f"STRENGTHS:\n{str(strengths).strip()}")

    if weaknesses and not pd.isna(weaknesses) and str(weaknesses).strip():
        parts.append(f"WEAKNESSES:\n{str(weaknesses).strip()}")

    if summary and not pd.isna(summary) and str(summary).strip():
        parts.append(f"SUMMARY:\n{str(summary).strip()}")

    if vss_score and not pd.isna(vss_score) and str(vss_score).strip():
        parts.append(f"VSS SCORE:\n{str(vss_score).strip()}")

    return "\n\n".join(parts)


def create_flag_report(cursor, player, match_id, user_id, combined_summary,
                       flag_category, scouting_type, report_date, position=""):
    """Create Flag report in database using dual ID system."""
    # Determine which player ID column to use based on data source
    if player['data_source'] == 'internal':
        player_id = None
        cafc_player_id = player['cafc_player_id']
    else:
        player_id = player['playerid']
        cafc_player_id = None

    # Convert report date to datetime if it's a string
    if isinstance(report_date, str):
        report_date = datetime.strptime(report_date, "%d/%m/%Y")

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
        position or "",
        "",  # formation - blank
        "",  # build - blank
        "",  # height - blank
        scouting_type or "Video",  # default to Video if not specified
        combined_summary,
        flag_category,
        report_date,
        True,  # IS_ARCHIVED
    ))


def read_excel_files():
    """Read Master Scout Reports Excel file."""
    print("="*80)
    print("READING MASTER SCOUT REPORTS")
    print("="*80 + "\n")

    excel_file = Path(EXCEL_FILE)

    if not excel_file.exists():
        print(f"✗ File not found: {EXCEL_FILE}")
        return None

    print(f"Reading: {excel_file.name}")
    print(f"Size: {excel_file.stat().st_size / 1024:.1f} KB\n")

    try:
        # Read Excel file - check available sheets
        xls = pd.ExcelFile(excel_file)
        print(f"Sheets available: {xls.sheet_names}\n")

        # Use first sheet by default (or 'Reports' if it exists)
        sheet_name = 'Reports' if 'Reports' in xls.sheet_names else 0
        print(f"Reading sheet: {sheet_name if isinstance(sheet_name, str) else xls.sheet_names[0]}")

        df = pd.read_excel(excel_file, sheet_name=sheet_name)
        print(f"✓ Loaded {len(df)} rows\n")

        # Add source file to each report
        df['source_file'] = excel_file.name

        return df

    except Exception as e:
        print(f"✗ Error reading file: {str(e)}")
        import traceback
        traceback.print_exc()
        return None


def detect_columns(df):
    """Detect column names from DataFrame."""
    col_map = {}
    for col in df.columns:
        col_lower = col.lower().strip()
        # More flexible matching - check for exact match OR pattern match
        if col_lower == 'player' or ('player' in col_lower and 'name' in col_lower):
            col_map['player'] = col
        elif col_lower == 'fixture' or (col_lower == 'match' and 'id' not in col_lower):
            if 'fixture' not in col_map:  # Don't overwrite
                col_map['fixture'] = col
        elif col_lower == 'scout' or col_lower == 'author':
            col_map['scout'] = col
        elif col_lower == 'report date' or ('report' in col_lower and 'date' in col_lower and 'fixture' not in col_lower):
            col_map['report_date'] = col
        elif col_lower == 'fixture date' or (('fixture' in col_lower or 'match' in col_lower) and 'date' in col_lower):
            col_map['fixture_date'] = col
        elif col_lower == 'grade' or ('grade' in col_lower and 'traffic' not in col_lower):
            col_map['grade'] = col
        elif col_lower == 'strengths' or (col_lower.startswith('strength') and '(' in col_lower):
            if 'strengths' not in col_map:
                col_map['strengths'] = col
        elif col_lower == 'weaknesses' or (col_lower.startswith('weakness') and '(' in col_lower):
            if 'weaknesses' not in col_map:
                col_map['weaknesses'] = col
        elif col_lower == 'summary' or ('summary' in col_lower and '(' in col_lower):
            if 'summary' not in col_map:
                col_map['summary'] = col
        elif 'vss' in col_lower:
            col_map['vss'] = col
        elif col_lower == 'position' or 'position' in col_lower:
            if 'position' not in col_map:
                col_map['position'] = col
        elif col_lower == 'live/video' or ('live' in col_lower and 'video' in col_lower):
            col_map['scouting_type'] = col

    return col_map


def import_reports(conn, reports_df):
    """Import reports in batches."""
    print("="*80)
    print("IMPORTING REPORTS")
    print("="*80 + "\n")

    cursor = conn.cursor()

    # Cache all players and scouts
    print("Caching players...")
    cursor.execute("SELECT PLAYERID, CAFC_PLAYER_ID, PLAYERNAME, SQUADNAME, POSITION, DATA_SOURCE FROM PLAYERS")
    all_players = cursor.fetchall()
    print(f"✓ Cached {len(all_players)} players")

    print("Caching users...")
    cursor.execute("SELECT ID, USERNAME, FIRSTNAME, LASTNAME FROM USERS")
    all_scouts = cursor.fetchall()
    print(f"✓ Cached {len(all_scouts)} users\n")

    # Detect columns
    col_map = detect_columns(reports_df)
    print(f"Detected columns: {col_map}\n")

    if not all(k in col_map for k in ['player', 'fixture', 'scout']):
        print("✗ ERROR: Missing required columns")
        return

    # Prepare CSV writers
    success_file = open('imported_reports.csv', 'w', newline='', encoding='utf-8')
    failure_file = open('failed_reports.csv', 'w', newline='', encoding='utf-8')

    success_writer = csv.writer(success_file)
    failure_writer = csv.writer(failure_file)

    # Write headers
    success_writer.writerow(['Row', 'Player', 'Fixture', 'Scout', 'Grade', 'Source File'])
    failure_writer.writerow(['Row', 'Player', 'Fixture', 'Scout', 'Error', 'Source File'])

    success_count = 0
    failure_count = 0
    batch_count = 0
    fuzzy_matches = []  # Track fuzzy fixture matches

    print(f"Processing {len(reports_df)} reports...\n")

    for idx, row in reports_df.iterrows():
        row_num = idx + 1

        if row_num % 10 == 0:
            percent = (row_num / len(reports_df)) * 100
            print(f"  Progress: {row_num}/{len(reports_df)} ({percent:.1f}%) - Success: {success_count}, Failed: {failure_count}")

        try:
            # Get values
            player_name = row.get(col_map.get('player'))
            fixture_str = row.get(col_map.get('fixture'))
            scout_name = row.get(col_map.get('scout'))
            fixture_date = row.get(col_map.get('fixture_date'))
            report_date = row.get(col_map.get('report_date'))
            grade = row.get(col_map.get('grade'))
            position = row.get(col_map.get('position', ''))
            scouting_type = row.get(col_map.get('scouting_type', 'Video'))
            source_file = row.get('source_file', 'Unknown')

            # Find player
            player, error = find_player(cursor, player_name, all_players)
            if error:
                failure_writer.writerow([row_num, player_name, fixture_str, scout_name, error, source_file])
                failure_count += 1
                continue

            # Find fixture
            match_id, error = find_fixture(cursor, fixture_str, fixture_date, fuzzy_matches)
            if error:
                failure_writer.writerow([row_num, player_name, fixture_str, scout_name, error, source_file])
                failure_count += 1
                continue

            # Find scout
            user_id, error = find_scout(cursor, scout_name, all_scouts)
            if error:
                failure_writer.writerow([row_num, player_name, fixture_str, scout_name, error, source_file])
                failure_count += 1
                continue

            # Combine content
            combined_summary = combine_content(
                row.get(col_map.get('strengths')),
                row.get(col_map.get('weaknesses')),
                row.get(col_map.get('summary')),
                row.get(col_map.get('vss'))
            )

            # Create report
            create_flag_report(
                cursor,
                player,
                match_id,
                user_id,
                combined_summary,
                grade,
                scouting_type,
                report_date,
                position
            )

            success_writer.writerow([row_num, player_name, fixture_str, scout_name, grade, source_file])
            success_count += 1
            batch_count += 1

            # Commit in batches
            if batch_count >= BATCH_SIZE:
                conn.commit()
                print(f"  ✓ Committed batch of {batch_count} reports")
                batch_count = 0

        except Exception as e:
            error_msg = str(e)
            failure_writer.writerow([row_num, player_name, fixture_str, scout_name, error_msg, source_file])
            failure_count += 1
            continue

    # Final commit
    if batch_count > 0:
        conn.commit()
        print(f"  ✓ Committed final batch of {batch_count} reports")

    # Close files
    success_file.close()
    failure_file.close()

    # Save fuzzy matches log
    if fuzzy_matches:
        with open('fuzzy_fixture_matches_import.txt', 'w') as f:
            f.write("FUZZY FIXTURE MATCHES (DURING IMPORT)\n")
            f.write("="*80 + "\n\n")
            f.write("These fixtures were matched using fuzzy string matching (not exact matches).\n")
            f.write("Similarity threshold: 85%\n\n")
            f.write("="*80 + "\n\n")
            for match in fuzzy_matches:
                f.write(f"SEARCHED FOR: {match['search']}\n")
                f.write(f"MATCHED WITH: {match['matched']}\n")
                f.write(f"DATE: {match['date']}\n")
                f.write(f"SIMILARITY: {match['similarity']}\n")
                f.write("-" * 80 + "\n\n")
        print(f"  ✓ Saved fuzzy_fixture_matches_import.txt ({len(fuzzy_matches)} fuzzy matches)\n")

    cursor.close()

    # Print summary
    print("\n" + "="*80)
    print("IMPORT COMPLETE")
    print("="*80 + "\n")
    print(f"✅ Successfully imported: {success_count} reports")
    print(f"❌ Failed: {failure_count} reports")
    print(f"\n📄 Results saved to:")
    print(f"  - imported_reports.csv")
    print(f"  - failed_reports.csv")
    if fuzzy_matches:
        print(f"  - fuzzy_fixture_matches_import.txt ({len(fuzzy_matches)} fuzzy matches)")


def main():
    """Main function to import bulk archived reports."""
    try:
        # Read Excel files
        reports_df = read_excel_files()
        if reports_df is None or len(reports_df) == 0:
            print("✗ No reports to import")
            return

        # Connect to database
        conn = get_snowflake_connection()

        # Import reports
        import_reports(conn, reports_df)

        # Close connection
        conn.close()

        print("\n✓ All done!")

    except Exception as e:
        print(f"\n✗ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
