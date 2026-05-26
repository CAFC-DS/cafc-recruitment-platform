"""
Fast re-analysis of skipped fixtures by reading failed_reports.txt.
Processes only reports that failed with "Too many fixtures" error.
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
import unicodedata

load_dotenv()

# Snowflake connection parameters
SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT")
SNOWFLAKE_USER = os.getenv("SNOWFLAKE_USERNAME")
SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE")
SNOWFLAKE_DATABASE = os.getenv("SNOWFLAKE_DATABASE")
SNOWFLAKE_SCHEMA = os.getenv("SNOWFLAKE_SCHEMA")
SNOWFLAKE_PRIVATE_KEY_PATH = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")

# Excel file
EXCEL_FILE = "/Users/hashim.umarji/Downloads/Master Scout Reports (2).xlsx"
FUZZY_THRESHOLD = 0.85


def get_private_key():
    """Load private key."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    key_path = os.path.join(script_dir, SNOWFLAKE_PRIVATE_KEY_PATH)
    with open(key_path, "rb") as key:
        p_key = serialization.load_pem_private_key(key.read(), password=None, backend=default_backend())
    return p_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


def get_snowflake_connection():
    """Connect to Snowflake."""
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
    print("✓ Connected\n")
    return conn


def normalize_unicode(text):
    """Normalize unicode."""
    if not text:
        return ""
    nfd = unicodedata.normalize('NFD', text)
    return ''.join([c for c in nfd if unicodedata.category(c) != 'Mn'])


def normalize_team_name(team_name):
    """Normalize team name."""
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
    """Parse fixture string."""
    if not fixture_str or pd.isna(fixture_str):
        return None, None
    fixture_str = str(fixture_str).strip()

    # Try different formats
    for pattern in [
        r'^(.+?)\s+\d+-\d+\s+(.+)$',  # "Team A 0-1 Team B"
        r'^(.+?)\s+\d+:\d+\s+(.+)$',  # "Team A 0:1 Team B"
        r'^(.+?)\s+-\s+(.+)$',         # "Team A - Team B"
        r'^(.+?)\s+v[s]?\s+(.+)$'      # "Team A vs Team B"
    ]:
        match = re.match(pattern, fixture_str, re.IGNORECASE)
        if match:
            return match.group(1).strip(), match.group(2).strip()
    return None, None


def find_fixture_unlimited(cursor, fixture_str, fixture_date, fuzzy_log=None):
    """Find fixture with NO LIMITS."""
    if not fixture_str or pd.isna(fixture_str):
        return None, "Empty fixture"
    if not fixture_date or pd.isna(fixture_date):
        return None, "Empty date"

    # Parse
    home_team, away_team = parse_fixture(fixture_str)
    if not home_team or not away_team:
        return None, f"Cannot parse: {fixture_str}"

    # Convert date
    try:
        if isinstance(fixture_date, str):
            date_obj = datetime.strptime(fixture_date, "%d/%m/%Y")
        else:
            date_obj = fixture_date
        formatted_date = date_obj.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return None, f"Invalid date: {fixture_date}"

    # PHASE 1: Exact matching
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
                match_id = result[1] if result[4] == 'internal' else result[0]
                return match_id, None

    # PHASE 2: Fuzzy matching (NO LIMITS)
    query = """
        SELECT ID, CAFC_MATCH_ID, HOMESQUADNAME, AWAYSQUADNAME, DATA_SOURCE
        FROM MATCHES
        WHERE DATE(SCHEDULEDDATE) = %s
    """
    cursor.execute(query, (formatted_date,))
    all_fixtures = cursor.fetchall()

    if not all_fixtures:
        return None, f"No fixtures on {formatted_date}"

    # Normalize
    home_normalized = normalize_unicode(home_team).upper().strip()
    away_normalized = normalize_unicode(away_team).upper().strip()

    best_match = None
    best_score = 0.0

    for fixture in all_fixtures:
        db_home = normalize_unicode(fixture[2]).upper().strip()
        db_away = normalize_unicode(fixture[3]).upper().strip()

        # Both directions
        home_score = SequenceMatcher(None, home_normalized, db_home).ratio()
        away_score = SequenceMatcher(None, away_normalized, db_away).ratio()
        avg_score = (home_score + away_score) / 2

        home_score_swap = SequenceMatcher(None, home_normalized, db_away).ratio()
        away_score_swap = SequenceMatcher(None, away_normalized, db_home).ratio()
        avg_score_swap = (home_score_swap + away_score_swap) / 2

        final_score = max(avg_score, avg_score_swap)

        if final_score > best_score and final_score >= FUZZY_THRESHOLD:
            best_score = final_score
            best_match = fixture

    if best_match:
        if fuzzy_log is not None:
            fuzzy_log.append({
                'search': f"{home_team} vs {away_team}",
                'matched': f"{best_match[2]} vs {best_match[3]}",
                'date': formatted_date,
                'similarity': f"{best_score:.2%}",
                'fixture_count': len(all_fixtures)
            })
        match_id = best_match[1] if best_match[4] == 'internal' else best_match[0]
        return match_id, None

    return None, f"Not found ({len(all_fixtures)} fixtures checked)"


def read_skipped_from_failed_reports():
    """Read failed_reports.txt and extract reports with 'Too many fixtures' error."""
    print("Reading failed_reports.txt to find skipped fixtures...")

    with open('failed_reports.txt', 'r') as f:
        content = f.read()

    # Split by report entries
    reports = []
    current_report = None

    for line in content.split('\n'):
        if line.startswith('Report #'):
            if current_report and 'Too many fixtures' in current_report.get('errors', ''):
                reports.append(current_report)
            current_report = {'row': int(line.split('#')[1].split(':')[0])}
        elif current_report is not None:
            if line.startswith('  Player:'):
                current_report['player'] = line.split(':', 1)[1].strip()
            elif line.startswith('  Fixture:'):
                current_report['fixture'] = line.split(':', 1)[1].strip()
            elif line.startswith('  Errors:'):
                current_report['errors'] = ''
            elif current_report.get('errors') is not None and line.startswith('    - '):
                current_report['errors'] += line.strip() + '\n'

    # Add last report
    if current_report and 'Too many fixtures' in current_report.get('errors', ''):
        reports.append(current_report)

    print(f"✓ Found {len(reports)} reports with 'Too many fixtures' error\n")
    return reports


def main():
    """Main function."""
    print("="*80)
    print("RE-ANALYZING SKIPPED FIXTURES (FAST METHOD)")
    print("="*80 + "\n")

    # Read skipped reports from failed_reports.txt
    skipped = read_skipped_from_failed_reports()

    if not skipped:
        print("No skipped fixtures found!")
        return

    # Load Excel to get fixture dates
    print(f"Loading Excel file...")
    df = pd.read_excel(EXCEL_FILE, sheet_name=0)
    print(f"✓ Loaded {len(df)} reports\n")

    # Connect to database
    conn = get_snowflake_connection()
    cursor = conn.cursor()

    fuzzy_matches = []
    success_count = 0
    failed_count = 0

    print("="*80)
    print(f"PROCESSING {len(skipped)} SKIPPED REPORTS WITH NO LIMITS")
    print("="*80 + "\n")

    for i, report in enumerate(skipped, 1):
        row_idx = report['row'] - 1  # Convert to 0-index

        if row_idx >= len(df):
            print(f"[{i}/{len(skipped)}] Row {report['row']}: SKIPPED (out of range)")
            failed_count += 1
            continue

        row_data = df.iloc[row_idx]
        fixture_date = row_data.get('Fixture Date')

        if pd.isna(fixture_date):
            print(f"[{i}/{len(skipped)}] Row {report['row']}: SKIPPED (no date)")
            failed_count += 1
            continue

        print(f"[{i}/{len(skipped)}] Row {report['row']}: {report['player']} - {report['fixture']}")

        match_id, error = find_fixture_unlimited(
            cursor,
            report['fixture'],
            fixture_date,
            fuzzy_matches
        )

        if match_id:
            print(f"  ✅ FOUND!")
            success_count += 1
        else:
            print(f"  ❌ {error}")
            failed_count += 1

        # Show progress every 10 reports
        if i % 10 == 0:
            print(f"\n  Progress: {i}/{len(skipped)} - Success: {success_count}, Failed: {failed_count}\n")

    # Summary
    print("\n" + "="*80)
    print("RESULTS")
    print("="*80 + "\n")
    print(f"Skipped reports analyzed: {len(skipped)}")
    print(f"✅ Now can be imported: {success_count}")
    print(f"❌ Still cannot match: {failed_count}")

    if success_count > 0:
        print(f"\n🎯 Recovery rate: {(success_count/len(skipped))*100:.1f}%")
        print(f"\n📊 Updated import stats:")
        print(f"   Original: 1263/3215 (39.3%)")
        print(f"   With recovered: {1263 + success_count}/3215 ({(1263+success_count)/3215*100:.1f}%)")

    # Save results
    if fuzzy_matches:
        print(f"\n💾 Saving results...")
        with open('recovered_fixtures.txt', 'w') as f:
            f.write("RECOVERED FIXTURES (Previously Skipped)\n")
            f.write("="*80 + "\n\n")
            f.write(f"{len(fuzzy_matches)} fixtures recovered via unlimited fuzzy matching\n\n")
            f.write("="*80 + "\n\n")
            for match in fuzzy_matches:
                f.write(f"SEARCHED: {match['search']}\n")
                f.write(f"MATCHED: {match['matched']}\n")
                f.write(f"DATE: {match['date']}\n")
                f.write(f"SIMILARITY: {match['similarity']}\n")
                f.write(f"FIXTURES ON DATE: {match['fixture_count']}\n")
                f.write("-" * 80 + "\n\n")
        print(f"  ✓ Saved recovered_fixtures.txt")

    with open('recovery_summary.txt', 'w') as f:
        f.write("RECOVERY ANALYSIS SUMMARY\n")
        f.write("="*80 + "\n\n")
        f.write(f"Reports with 'Too many fixtures' error: {len(skipped)}\n")
        f.write(f"Recovered: {success_count}\n")
        f.write(f"Still missing: {failed_count}\n\n")
        if success_count > 0:
            f.write(f"Recovery rate: {(success_count/len(skipped))*100:.1f}%\n\n")
        f.write(f"Original import: 1263/3215 (39.3%)\n")
        f.write(f"With recovery: {1263 + success_count}/3215 ({(1263+success_count)/3215*100:.1f}%)\n")
    print(f"  ✓ Saved recovery_summary.txt")

    print("\n✓ Complete!")
    cursor.close()
    conn.close()


if __name__ == "__main__":
    main()
