"""
Analysis Script for Archived Reports Import

This script analyzes Excel files containing archived scout reports and determines:
1. Which reports can be imported successfully (all matches found)
2. Which reports will fail (missing player, fixture, or scout data)
3. Detailed breakdown of issues

NO DATABASE CHANGES - This is a dry-run analysis only.

Usage:
    python analyze_archived_reports.py
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
import json
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
EXCEL_FILE = "/Users/hashim.umarji/Downloads/Master Scout Reports_new.xlsx"

# Mapping files
PLAYER_MAPPINGS_FILE = "player_mappings.json"
SCOUT_MAPPINGS_FILE = "scout_mappings.json"  # Optional - maps old scout names to user IDs
DEFAULT_SCOUT_USER_ID = 301  # Use this user ID for unmapped scouts (old scouts)

# Fuzzy matching performance configuration
ENABLE_FUZZY_MATCHING = True       # Set to False to disable fuzzy matching entirely
MAX_FIXTURES_FOR_FUZZY = 1000      # Skip fuzzy matching if more fixtures than this on a date (increased from 100)
FUZZY_THRESHOLD = 0.85             # Similarity threshold for fuzzy matching (85%)
USE_SMART_FILTERING = True         # Pre-filter fixtures before fuzzy matching for better performance

def load_mappings():
    """Load player and scout mapping files."""
    player_mappings = {}
    scout_mappings = {}

    # Load player mappings
    if os.path.exists(PLAYER_MAPPINGS_FILE):
        with open(PLAYER_MAPPINGS_FILE, 'r') as f:
            player_mappings = json.load(f)
        print(f"✓ Loaded {len(player_mappings)} player mappings")
    else:
        print(f"⚠️  Player mappings file not found: {PLAYER_MAPPINGS_FILE}")

    # Load scout mappings
    if os.path.exists(SCOUT_MAPPINGS_FILE):
        with open(SCOUT_MAPPINGS_FILE, 'r') as f:
            scout_mappings = json.load(f)
        print(f"✓ Loaded {len(scout_mappings)} scout mappings")
    else:
        print(f"⚠️  Scout mappings file not found: {SCOUT_MAPPINGS_FILE}")

    return player_mappings, scout_mappings

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


def find_player(cursor, player_name, all_players_cache, player_mappings=None):
    """Find player by name with fuzzy matching and player mappings."""
    if not player_name or pd.isna(player_name):
        return None, "Empty player name"

    player_name = str(player_name).strip()

    # Apply player mapping if available
    mapped_player_name = player_name
    if player_mappings and player_name in player_mappings:
        mapped_player_name = player_mappings[player_name]

    # Try exact match first (with mapped name)
    query = """
        SELECT PLAYERID, CAFC_PLAYER_ID, PLAYERNAME, SQUADNAME, DATA_SOURCE
        FROM PLAYERS
        WHERE UPPER(PLAYERNAME) = UPPER(%s)
        LIMIT 1
    """
    cursor.execute(query, (mapped_player_name,))
    result = cursor.fetchone()

    if result:
        return {
            "playerid": result[0],
            "cafc_player_id": result[1],
            "player_name": result[2],
            "data_source": result[4]
        }, None

    # Try fuzzy match (use mapped name for fuzzy matching too)
    normalized_search = normalize_name(mapped_player_name)
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
                    "data_source": player[4]
                }

    if best_match:
        return best_match, None

    # Show original name in error if mapping was applied
    if mapped_player_name != player_name:
        return None, f"Player not found: {player_name} (mapped to: {mapped_player_name})"
    return None, f"Player not found: {player_name}"


def normalize_unicode(text):
    """Normalize unicode characters (remove accents, umlauts, etc.)."""
    if not text:
        return ""
    # NFD = Canonical Decomposition, separates base characters from diacritics
    nfd = unicodedata.normalize('NFD', text)
    # Keep only ASCII characters (filters out combining diacritical marks)
    return ''.join([c for c in nfd if unicodedata.category(c) != 'Mn'])


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
    """Find fixture by parsing team names and date with fuzzy matching."""
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

    # Get all variations of both team names
    home_variations = normalize_team_name(home_team)
    away_variations = normalize_team_name(away_team)

    # PHASE 1: Try exact LIKE matching with each combination of variations
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

    # Get all fixtures on this date (no hard limit - we'll process them all)
    query = """
        SELECT ID, CAFC_MATCH_ID, HOMESQUADNAME, AWAYSQUADNAME, DATA_SOURCE
        FROM MATCHES
        WHERE DATE(SCHEDULEDDATE) = %s
    """
    cursor.execute(query, (formatted_date,))
    all_fixtures = cursor.fetchall()

    # Normalize search teams for fuzzy matching
    home_normalized = normalize_unicode(home_team).upper().strip()
    away_normalized = normalize_unicode(away_team).upper().strip()

    # Smart filtering: Extract key words from team names to pre-filter candidates
    if USE_SMART_FILTERING and fixture_count > 50:
        # Extract significant words (ignore common prefixes/suffixes)
        ignore_words = {'FC', 'AFC', 'CF', 'SC', 'SK', 'AC', 'AS', 'RC', 'FK',
                       'UNITED', 'CITY', 'TOWN', 'ATHLETIC', 'WANDERERS'}
        home_words = set(w for w in home_normalized.split() if w not in ignore_words and len(w) > 2)
        away_words = set(w for w in away_normalized.split() if w not in ignore_words and len(w) > 2)

        # Pre-filter fixtures: must contain at least one significant word from either team
        filtered_fixtures = []
        for fixture in all_fixtures:
            db_home = normalize_unicode(fixture[2]).upper().strip()
            db_away = normalize_unicode(fixture[3]).upper().strip()
            db_home_words = set(w for w in db_home.split() if len(w) > 2)
            db_away_words = set(w for w in db_away.split() if len(w) > 2)

            # Check if any significant word matches
            if (home_words & db_home_words) or (home_words & db_away_words) or \
               (away_words & db_home_words) or (away_words & db_away_words):
                filtered_fixtures.append(fixture)

        all_fixtures = filtered_fixtures if filtered_fixtures else all_fixtures

    # Try fuzzy matching with high threshold
    best_match = None
    best_score = 0.0

    for fixture in all_fixtures:
        db_home = normalize_unicode(fixture[2]).upper().strip()
        db_away = normalize_unicode(fixture[3]).upper().strip()

        # Calculate similarity scores (both directions for home/away swap)
        home_score = SequenceMatcher(None, home_normalized, db_home).ratio()
        away_score = SequenceMatcher(None, away_normalized, db_away).ratio()
        avg_score = (home_score + away_score) / 2

        # Also try swapped (in case home/away are reversed)
        home_score_swap = SequenceMatcher(None, home_normalized, db_away).ratio()
        away_score_swap = SequenceMatcher(None, away_normalized, db_home).ratio()
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


def find_scout(cursor, scout_name, all_scouts_cache, scout_mappings=None):
    """Find scout by name and return user ID, with support for scout mappings."""
    if not scout_name or pd.isna(scout_name):
        return None, "Empty scout name"

    scout_name = str(scout_name).strip()

    # Check if scout has a mapping (for old scouts)
    if scout_mappings and scout_name in scout_mappings:
        mapped_user_id = scout_mappings[scout_name]
        return mapped_user_id, None

    # Try matching by FIRSTNAME + LASTNAME
    for user in all_scouts_cache:
        full_name = f"{user[2]} {user[3]}".strip().upper()
        if full_name == scout_name.upper():
            return user[0], None

    # Try matching by USERNAME
    for user in all_scouts_cache:
        if user[1].upper() == scout_name.upper():
            return user[0], None

    # If no match found and DEFAULT_SCOUT_USER_ID is set, use it
    if DEFAULT_SCOUT_USER_ID is not None:
        return DEFAULT_SCOUT_USER_ID, None

    return None, f"Scout not found: {scout_name}"


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
        print(f"✓ Loaded {len(df)} rows")
        print(f"✓ Columns: {list(df.columns)}\n")

        # Add source file to each report
        df['source_file'] = excel_file.name

        return df

    except Exception as e:
        print(f"✗ Error reading file: {str(e)}")
        import traceback
        traceback.print_exc()
        return None


def analyze_reports(conn, reports_df):
    """Analyze which reports can be imported."""
    print("\n" + "="*80)
    print("ANALYZING REPORTS")
    print("="*80 + "\n")

    cursor = conn.cursor()

    # Load mappings
    print("Loading mappings...")
    player_mappings, scout_mappings = load_mappings()
    print()

    # Cache all players and scouts for faster lookups
    print("Caching players from database...")
    cursor.execute("SELECT PLAYERID, CAFC_PLAYER_ID, PLAYERNAME, SQUADNAME, DATA_SOURCE FROM PLAYERS")
    all_players = cursor.fetchall()
    print(f"✓ Cached {len(all_players)} players")

    print("Caching users from database...")
    cursor.execute("SELECT ID, USERNAME, FIRSTNAME, LASTNAME FROM USERS")
    all_scouts = cursor.fetchall()
    print(f"✓ Cached {len(all_scouts)} users\n")

    results = {
        'total': 0,
        'success': [],
        'failures': [],
        'missing_players': set(),
        'missing_fixtures': set(),
        'missing_scouts': set(),
        'fuzzy_matches': [],     # Log for fuzzy fixture matches
        'skipped_fuzzy': set()   # Track fixtures skipped due to fuzzy matching limits
    }

    # Try to identify column names (different exports may have different names)
    print("Detecting column names...")
    col_map = {}
    for col in reports_df.columns:
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

    print(f"✓ Detected columns: {col_map}\n")

    if not all(k in col_map for k in ['player', 'fixture', 'scout']):
        print("✗ ERROR: Could not detect required columns (player, fixture, scout)")
        print(f"Available columns: {list(reports_df.columns)}")
        return results

    print(f"Analyzing {len(reports_df)} reports...\n")

    for idx, row in reports_df.iterrows():
        results['total'] += 1

        if results['total'] % 10 == 0:
            success_count = len(results['success'])
            failure_count = len(results['failures'])
            percent = (results['total'] / len(reports_df)) * 100
            print(f"  Progress: {results['total']}/{len(reports_df)} ({percent:.1f}%) - Success: {success_count}, Failed: {failure_count}")

        report_info = {
            'row': idx + 1,
            'player_name': row.get(col_map.get('player')),
            'fixture': row.get(col_map.get('fixture')),
            'scout': row.get(col_map.get('scout')),
            'source_file': row.get('source_file'),
            'errors': []
        }

        # Check player (with mappings)
        player, error = find_player(cursor, report_info['player_name'], all_players, player_mappings)
        if error:
            report_info['errors'].append(error)
            results['missing_players'].add(str(report_info['player_name']))

        # Check fixture
        fixture_id, error = find_fixture(
            cursor,
            report_info['fixture'],
            row.get(col_map.get('fixture_date')),
            results['fuzzy_matches']  # Pass fuzzy match log
        )
        if error:
            report_info['errors'].append(error)
            fixture_key = f"{report_info['fixture']} on {row.get(col_map.get('fixture_date'))}"
            results['missing_fixtures'].add(fixture_key)
            # Track if skipped due to fuzzy matching limits
            if "Too many fixtures" in error or "skipping fuzzy match" in error:
                results['skipped_fuzzy'].add(fixture_key)

        # Check scout (with mappings)
        scout_id, error = find_scout(cursor, report_info['scout'], all_scouts, scout_mappings)
        if error:
            report_info['errors'].append(error)
            results['missing_scouts'].add(str(report_info['scout']))

        # Determine success or failure
        if not report_info['errors']:
            results['success'].append(report_info)
        else:
            results['failures'].append(report_info)

    cursor.close()
    return results


def generate_report(results):
    """Generate analysis report."""
    print("\n" + "="*80)
    print("ANALYSIS REPORT")
    print("="*80 + "\n")

    total = results['total']
    success_count = len(results['success'])
    failure_count = len(results['failures'])

    print(f"📊 SUMMARY")
    print(f"  Total reports analyzed: {total}")
    if total > 0:
        print(f"  ✅ Can be imported: {success_count} ({success_count/total*100:.1f}%)")
        print(f"  ❌ Will fail: {failure_count} ({failure_count/total*100:.1f}%)")
    else:
        print(f"  ⚠️ No reports could be analyzed (check column detection)")

    print(f"\n📋 MISSING DATA")
    print(f"  Missing players: {len(results['missing_players'])}")
    print(f"  Missing fixtures: {len(results['missing_fixtures'])}")
    print(f"  Missing scouts: {len(results['missing_scouts'])}")
    print(f"  Skipped (too many fixtures for fuzzy match): {len(results['skipped_fuzzy'])}")

    # Save detailed results to files
    print(f"\n💾 SAVING RESULTS TO FILES")

    # Save missing players
    if results['missing_players']:
        with open('missing_players.txt', 'w') as f:
            f.write("MISSING PLAYERS\n")
            f.write("="*80 + "\n\n")
            for player in sorted(results['missing_players']):
                f.write(f"{player}\n")
        print(f"  ✓ Saved missing_players.txt ({len(results['missing_players'])} players)")

    # Save missing fixtures
    if results['missing_fixtures']:
        with open('missing_fixtures.txt', 'w') as f:
            f.write("MISSING FIXTURES\n")
            f.write("="*80 + "\n\n")
            for fixture in sorted(results['missing_fixtures']):
                f.write(f"{fixture}\n")
        print(f"  ✓ Saved missing_fixtures.txt ({len(results['missing_fixtures'])} fixtures)")

    # Save missing scouts
    if results['missing_scouts']:
        with open('missing_scouts.txt', 'w') as f:
            f.write("MISSING SCOUTS\n")
            f.write("="*80 + "\n\n")
            for scout in sorted(results['missing_scouts']):
                f.write(f"{scout}\n")

            # Create mapping template
            f.write("\n\n" + "="*80)
            f.write("\nSCOUT MAPPING TEMPLATE (JSON)\n")
            f.write("="*80 + "\n\n")
            mapping = {}
            for scout in sorted(results['missing_scouts']):
                mapping[scout] = "USER_ID_HERE"
            f.write(json.dumps(mapping, indent=2))
        print(f"  ✓ Saved missing_scouts.txt ({len(results['missing_scouts'])} scouts)")

    # Save failed reports
    if results['failures']:
        with open('failed_reports.txt', 'w') as f:
            f.write("FAILED REPORTS\n")
            f.write("="*80 + "\n\n")
            for report in results['failures']:
                f.write(f"Row {report['row']} ({report['source_file']}):\n")
                f.write(f"  Player: {report['player_name']}\n")
                f.write(f"  Fixture: {report['fixture']}\n")
                f.write(f"  Scout: {report['scout']}\n")
                f.write(f"  Errors:\n")
                for error in report['errors']:
                    f.write(f"    - {error}\n")
                f.write("\n")
        print(f"  ✓ Saved failed_reports.txt ({len(results['failures'])} failed reports)")

    # Save fuzzy matches log
    if results.get('fuzzy_matches'):
        with open('fuzzy_fixture_matches.txt', 'w') as f:
            f.write("FUZZY FIXTURE MATCHES\n")
            f.write("="*80 + "\n\n")
            f.write("These fixtures were matched using fuzzy string matching (not exact matches).\n")
            f.write("Similarity threshold: 85%\n\n")
            f.write("="*80 + "\n\n")
            for match in results['fuzzy_matches']:
                f.write(f"SEARCHED FOR: {match['search']}\n")
                f.write(f"MATCHED WITH: {match['matched']}\n")
                f.write(f"DATE: {match['date']}\n")
                f.write(f"SIMILARITY: {match['similarity']}\n")
                f.write("-" * 80 + "\n\n")
        print(f"  ✓ Saved fuzzy_fixture_matches.txt ({len(results['fuzzy_matches'])} fuzzy matches)")

    # Save analysis summary
    with open('analysis_summary.txt', 'w') as f:
        f.write("ARCHIVED REPORTS IMPORT ANALYSIS\n")
        f.write("="*80 + "\n\n")
        f.write(f"Total reports: {total}\n")
        f.write(f"Can be imported: {success_count} ({success_count/total*100:.1f}%)\n")
        f.write(f"Will fail: {failure_count} ({failure_count/total*100:.1f}%)\n\n")
        f.write(f"Missing players: {len(results['missing_players'])}\n")
        f.write(f"Missing fixtures: {len(results['missing_fixtures'])}\n")
        f.write(f"Missing scouts: {len(results['missing_scouts'])}\n")
        f.write(f"Skipped (too many fixtures for fuzzy match): {len(results['skipped_fuzzy'])}\n")
        f.write(f"Fuzzy fixture matches: {len(results.get('fuzzy_matches', []))}\n")
    print(f"  ✓ Saved analysis_summary.txt")

    print(f"\n✓ Analysis complete!")


def main():
    """Main function to analyze archived reports."""
    try:
        # Read Excel files
        reports_df = read_excel_files()
        if reports_df is None or len(reports_df) == 0:
            print("✗ No reports to analyze")
            return

        # Connect to database
        conn = get_snowflake_connection()

        # Analyze reports
        results = analyze_reports(conn, reports_df)

        # Generate report
        generate_report(results)

        # Close connection
        conn.close()

    except Exception as e:
        print(f"\n✗ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
