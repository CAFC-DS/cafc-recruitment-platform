"""
Analyze the 262 reports that were skipped due to fuzzy matching limits.
This script processes ONLY those reports with no fixture count limits.
"""

import snowflake.connector
import pandas as pd
import os
from datetime import datetime
import re
from difflib import SequenceMatcher
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from pathlib import Path
import unicodedata

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

# NO LIMITS for this analysis - process all fixtures
FUZZY_THRESHOLD = 0.85  # Still keep 85% similarity threshold


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


def normalize_unicode(text):
    """Normalize unicode characters (remove accents, umlauts, etc.)."""
    if not text:
        return ""
    nfd = unicodedata.normalize('NFD', text)
    return ''.join([c for c in nfd if unicodedata.category(c) != 'Mn'])


def normalize_team_name(team_name):
    """Normalize team name by removing common affixes, unicode, and extra spaces."""
    if not team_name:
        return []

    team_name = normalize_unicode(team_name)
    normalized = ' '.join(team_name.strip().upper().split())

    prefixes = ['FC ', 'AFC ', 'CF ', 'SC ', 'SK ', 'AC ', 'AS ', 'RC ', 'FK ']
    suffixes = [' FC', ' AFC', ' CF', ' SC', ' SK', ' AC', ' AS', ' RC', ' FK',
                ' UNITED', ' CITY', ' TOWN', ' ATHLETIC', ' WANDERERS']

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


def find_fixture_unlimited(cursor, fixture_str, fixture_date, fuzzy_match_log=None):
    """
    Find fixture with NO LIMITS on fuzzy matching.
    This is slower but more thorough.
    """
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

    for home_var in home_variations:
        for away_var in away_variations:
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
                if result[4] == 'internal':
                    match_id = result[1]
                else:
                    match_id = result[0]
                return match_id, None

    # PHASE 2: Fuzzy matching with NO LIMITS
    # Get ALL fixtures on this date (no limit)
    query = """
        SELECT ID, CAFC_MATCH_ID, HOMESQUADNAME, AWAYSQUADNAME, DATA_SOURCE
        FROM MATCHES
        WHERE DATE(SCHEDULEDDATE) = %s
    """
    cursor.execute(query, (formatted_date,))
    all_fixtures = cursor.fetchall()

    if len(all_fixtures) == 0:
        return None, f"No fixtures found on {formatted_date}"

    # Normalize search teams for fuzzy matching
    home_normalized = normalize_unicode(home_team).upper().strip()
    away_normalized = normalize_unicode(away_team).upper().strip()

    # Try fuzzy matching with high threshold
    best_match = None
    best_score = 0.0

    print(f"  Fuzzy matching {fixture_str} on {formatted_date} ({len(all_fixtures)} fixtures to check)...")

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
                'similarity': f"{best_score:.2%}",
                'fixture_count': len(all_fixtures)
            }
            fuzzy_match_log.append(log_entry)

        if best_match[4] == 'internal':
            match_id = best_match[1]
        else:
            match_id = best_match[0]
        return match_id, None

    return None, f"Fixture not found: {fixture_str} on {formatted_date} ({len(all_fixtures)} fixtures checked)"


def read_missing_fixtures():
    """Read the missing_fixtures.txt file to get the list of skipped fixtures."""
    with open('missing_fixtures.txt', 'r') as f:
        lines = f.readlines()

    # Skip header lines
    skipped_fixtures = []
    for line in lines[2:]:  # Skip "MISSING FIXTURES" and "===" lines
        line = line.strip()
        if line and not line.startswith("="):
            # Parse line like "Fixture on date"
            skipped_fixtures.append(line)

    return skipped_fixtures


def main():
    """Main function to analyze skipped fixtures."""
    print("="*80)
    print("ANALYZING SKIPPED FIXTURES (NO LIMITS)")
    print("="*80 + "\n")

    print("This script will process the 262 reports that were skipped due to")
    print("too many fixtures on their dates. This will be slower but more thorough.\n")

    try:
        # Read Excel file
        excel_file = Path(EXCEL_FILE)
        if not excel_file.exists():
            print(f"✗ File not found: {EXCEL_FILE}")
            return

        print(f"Reading: {excel_file.name}")
        df = pd.read_excel(excel_file, sheet_name=0)
        print(f"✓ Loaded {len(df)} total reports\n")

        # Connect to database
        conn = get_snowflake_connection()
        cursor = conn.cursor()

        # Identify column names
        col_map = {}
        for col in df.columns:
            col_lower = col.lower().strip()
            if col_lower == 'fixture' or (col_lower == 'match' and 'id' not in col_lower):
                if 'fixture' not in col_map:
                    col_map['fixture'] = col
            elif col_lower == 'fixture date' or (('fixture' in col_lower or 'match' in col_lower) and 'date' in col_lower):
                col_map['fixture_date'] = col
            elif col_lower == 'player' or ('player' in col_lower and 'name' in col_lower):
                col_map['player'] = col

        if 'fixture' not in col_map or 'fixture_date' not in col_map:
            print("✗ Could not detect fixture columns")
            return

        print(f"Detected columns: {col_map}\n")

        # Filter to only reports that were skipped
        # We need to identify which reports had "Too many fixtures" errors
        skipped_reports = []
        fuzzy_matches = []

        print("Analyzing reports to find skipped fixtures...\n")

        for idx, row in df.iterrows():
            fixture_str = row.get(col_map['fixture'])
            fixture_date = row.get(col_map['fixture_date'])

            if pd.isna(fixture_str) or pd.isna(fixture_date):
                continue

            # Parse teams and date
            home_team, away_team = parse_fixture(fixture_str)
            if not home_team or not away_team:
                continue

            try:
                if isinstance(fixture_date, str):
                    date_obj = datetime.strptime(fixture_date, "%d/%m/%Y")
                else:
                    date_obj = fixture_date
                formatted_date = date_obj.strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                continue

            # Check if this date has > 100 fixtures (was previously skipped)
            count_query = "SELECT COUNT(*) FROM MATCHES WHERE DATE(SCHEDULEDDATE) = %s"
            cursor.execute(count_query, (formatted_date,))
            fixture_count = cursor.fetchone()[0]

            if fixture_count > 100:
                skipped_reports.append({
                    'row': idx + 1,
                    'fixture': fixture_str,
                    'fixture_date': fixture_date,
                    'fixture_count': fixture_count,
                    'player': row.get(col_map.get('player'))
                })

        print(f"Found {len(skipped_reports)} reports that were previously skipped\n")
        print("="*80)
        print(f"PROCESSING {len(skipped_reports)} SKIPPED REPORTS WITH NO LIMITS")
        print("="*80 + "\n")
        print("⚠️  This may take a while for dates with hundreds of fixtures...\n")

        success_count = 0
        failed_count = 0

        for i, report in enumerate(skipped_reports, 1):
            print(f"\n[{i}/{len(skipped_reports)}] Row {report['row']}: {report['player']} - {report['fixture']}")
            print(f"  Date: {report['fixture_date']} ({report['fixture_count']} fixtures on this date)")

            match_id, error = find_fixture_unlimited(
                cursor,
                report['fixture'],
                report['fixture_date'],
                fuzzy_matches
            )

            if match_id:
                print(f"  ✅ FOUND via fuzzy matching!")
                success_count += 1
                report['status'] = 'found'
                report['match_id'] = match_id
            else:
                print(f"  ❌ Not found: {error}")
                failed_count += 1
                report['status'] = 'not_found'
                report['error'] = error

        # Print summary
        print("\n" + "="*80)
        print("SKIPPED FIXTURES ANALYSIS COMPLETE")
        print("="*80 + "\n")
        print(f"Total skipped reports analyzed: {len(skipped_reports)}")
        print(f"✅ Now can be imported: {success_count}")
        print(f"❌ Still cannot be imported: {failed_count}")

        if success_count > 0:
            improvement_rate = (success_count / len(skipped_reports)) * 100
            print(f"\n🎯 Recovery rate: {improvement_rate:.1f}%")

        # Save detailed results
        print(f"\n💾 SAVING RESULTS")

        # Save newly found fixtures
        if fuzzy_matches:
            with open('skipped_fixtures_now_found.txt', 'w') as f:
                f.write("PREVIOUSLY SKIPPED FIXTURES - NOW FOUND\n")
                f.write("="*80 + "\n\n")
                f.write(f"These {len(fuzzy_matches)} fixtures were previously skipped due to >100 fixtures\n")
                f.write("on their dates, but have now been matched via unlimited fuzzy matching.\n\n")
                f.write("="*80 + "\n\n")
                for match in fuzzy_matches:
                    f.write(f"SEARCHED FOR: {match['search']}\n")
                    f.write(f"MATCHED WITH: {match['matched']}\n")
                    f.write(f"DATE: {match['date']}\n")
                    f.write(f"SIMILARITY: {match['similarity']}\n")
                    f.write(f"FIXTURES ON DATE: {match['fixture_count']}\n")
                    f.write("-" * 80 + "\n\n")
            print(f"  ✓ Saved skipped_fixtures_now_found.txt ({len(fuzzy_matches)} fixtures)")

        # Save summary
        with open('skipped_fixtures_analysis.txt', 'w') as f:
            f.write("SKIPPED FIXTURES ANALYSIS SUMMARY\n")
            f.write("="*80 + "\n\n")
            f.write(f"Total reports previously skipped: {len(skipped_reports)}\n")
            f.write(f"Now can be imported: {success_count}\n")
            f.write(f"Still cannot be imported: {failed_count}\n\n")
            if success_count > 0:
                f.write(f"Recovery rate: {(success_count/len(skipped_reports))*100:.1f}%\n\n")
            f.write(f"\nOriginal import rate: 1263/3215 (39.3%)\n")
            f.write(f"With recovered fixtures: {1263 + success_count}/3215 ({(1263+success_count)/3215*100:.1f}%)\n")
        print(f"  ✓ Saved skipped_fixtures_analysis.txt")

        print("\n✓ Analysis complete!")

        cursor.close()
        conn.close()

    except Exception as e:
        print(f"\n✗ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
