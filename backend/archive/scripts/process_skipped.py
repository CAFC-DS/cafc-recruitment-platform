"""Process skipped fixtures efficiently."""
import snowflake.connector
import pandas as pd
import os
import re
from datetime import datetime
from difflib import SequenceMatcher
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
import unicodedata

load_dotenv()


def get_private_key():
    """Load private key."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    key_path = os.path.join(script_dir, os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH"))
    with open(key_path, "rb") as key:
        p_key = serialization.load_pem_private_key(key.read(), password=None, backend=default_backend())
    return p_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


def connect_snowflake():
    """Connect to Snowflake."""
    print("Connecting to Snowflake...")
    pkb = get_private_key()
    conn = snowflake.connector.connect(
        account=os.getenv("SNOWFLAKE_ACCOUNT"),
        user=os.getenv("SNOWFLAKE_USERNAME"),
        warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
        database=os.getenv("SNOWFLAKE_DATABASE"),
        schema=os.getenv("SNOWFLAKE_SCHEMA"),
        private_key=pkb
    )
    print("✓ Connected\n")
    return conn


def normalize_unicode(text):
    if not text:
        return ""
    nfd = unicodedata.normalize('NFD', text)
    return ''.join([c for c in nfd if unicodedata.category(c) != 'Mn'])


def normalize_team_name(team_name):
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
    if not fixture_str or pd.isna(fixture_str):
        return None, None
    fixture_str = str(fixture_str).strip()
    patterns = [
        r'^(.+?)\s+\d+-\d+\s+(.+)$',
        r'^(.+?)\s+\d+:\d+\s+(.+)$',
        r'^(.+?)\s+-\s+(.+)$',
        r'^(.+?)\s+v[s]?\s+(.+)$'
    ]
    for pattern in patterns:
        match = re.match(pattern, fixture_str, re.IGNORECASE)
        if match:
            return match.group(1).strip(), match.group(2).strip()
    return None, None


def find_fixture_unlimited(cursor, fixture_str, fixture_date, fuzzy_log=None):
    """Find fixture with unlimited fuzzy matching."""
    if not fixture_str or pd.isna(fixture_str):
        return None, "Empty fixture"
    if not fixture_date or pd.isna(fixture_date):
        return None, "Empty date"

    home_team, away_team = parse_fixture(fixture_str)
    if not home_team or not away_team:
        return None, f"Cannot parse: {fixture_str}"

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
            cursor.execute(query, (f"%{home_var}%", f"%{away_var}%", f"%{away_var}%", f"%{home_var}%", formatted_date))
            result = cursor.fetchone()
            if result:
                return result[1] if result[4] == 'internal' else result[0], None

    # PHASE 2: Fuzzy matching (NO LIMITS)
    query = "SELECT ID, CAFC_MATCH_ID, HOMESQUADNAME, AWAYSQUADNAME, DATA_SOURCE FROM MATCHES WHERE DATE(SCHEDULEDDATE) = %s"
    cursor.execute(query, (formatted_date,))
    all_fixtures = cursor.fetchall()

    if not all_fixtures:
        return None, f"No fixtures on {formatted_date}"

    home_normalized = normalize_unicode(home_team).upper().strip()
    away_normalized = normalize_unicode(away_team).upper().strip()

    best_match = None
    best_score = 0.0

    for fixture in all_fixtures:
        db_home = normalize_unicode(fixture[2]).upper().strip()
        db_away = normalize_unicode(fixture[3]).upper().strip()

        home_score = SequenceMatcher(None, home_normalized, db_home).ratio()
        away_score = SequenceMatcher(None, away_normalized, db_away).ratio()
        avg_score = (home_score + away_score) / 2

        home_score_swap = SequenceMatcher(None, home_normalized, db_away).ratio()
        away_score_swap = SequenceMatcher(None, away_normalized, db_home).ratio()
        avg_score_swap = (home_score_swap + away_score_swap) / 2

        final_score = max(avg_score, avg_score_swap)

        if final_score > best_score and final_score >= 0.85:
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
        return best_match[1] if best_match[4] == 'internal' else best_match[0], None

    return None, f"Not found ({len(all_fixtures)} checked)"


def parse_failed_reports():
    """Parse failed_reports.txt to get skipped fixtures."""
    print("Reading failed_reports.txt...")

    with open('failed_reports.txt', 'r') as f:
        content = f.read()

    skipped = []
    lines = content.split('\n')
    i = 0

    while i < len(lines):
        line = lines[i]

        # Look for Row entries
        if line.startswith('Row '):
            # Extract row number
            match = re.match(r'Row (\d+)', line)
            if match:
                row_num = int(match.group(1))

                # Extract player, fixture, scout from next few lines
                player = None
                fixture = None
                scout = None
                has_too_many_fixtures = False

                # Look ahead for details
                for j in range(i+1, min(i+10, len(lines))):
                    if lines[j].strip().startswith('Player:'):
                        player = lines[j].split(':', 1)[1].strip()
                    elif lines[j].strip().startswith('Fixture:'):
                        fixture = lines[j].split(':', 1)[1].strip()
                    elif lines[j].strip().startswith('Scout:'):
                        scout = lines[j].split(':', 1)[1].strip()
                    elif 'Too many fixtures' in lines[j]:
                        has_too_many_fixtures = True
                    elif lines[j].startswith('Row '):  # Next entry
                        break

                if has_too_many_fixtures and fixture:
                    skipped.append({
                        'row': row_num,
                        'player': player,
                        'fixture': fixture,
                        'scout': scout
                    })

        i += 1

    print(f"✓ Found {len(skipped)} skipped reports\n")
    return skipped


def main():
    print("="*80)
    print("PROCESSING SKIPPED FIXTURES")
    print("="*80 + "\n")

    # Parse failed reports
    skipped = parse_failed_reports()

    if not skipped:
        print("No skipped fixtures found!")
        return

    # Load Excel
    print("Loading Excel...")
    df = pd.read_excel("/Users/hashim.umarji/Downloads/Master Scout Reports (2).xlsx", sheet_name=0)
    print(f"✓ Loaded {len(df)} reports\n")

    # Connect
    conn = connect_snowflake()
    cursor = conn.cursor()

    fuzzy_matches = []
    success = 0
    failed = 0

    print("="*80)
    print(f"PROCESSING {len(skipped)} REPORTS (NO LIMITS)")
    print("="*80 + "\n")

    for i, report in enumerate(skipped, 1):
        row_idx = report['row'] - 1

        if row_idx >= len(df):
            print(f"[{i}/{len(skipped)}] Row {report['row']}: SKIPPED (out of range)")
            failed += 1
            continue

        row_data = df.iloc[row_idx]
        fixture_date = row_data.get('Fixture Date')

        print(f"[{i}/{len(skipped)}] Row {report['row']}: {report['player']} - {report['fixture']}")

        match_id, error = find_fixture_unlimited(cursor, report['fixture'], fixture_date, fuzzy_matches)

        if match_id:
            print(f"  ✅ FOUND!")
            success += 1
        else:
            print(f"  ❌ {error}")
            failed += 1

        if i % 10 == 0:
            print(f"\n  Progress: Success={success}, Failed={failed}\n")

    # Summary
    print("\n" + "="*80)
    print("RESULTS")
    print("="*80 + "\n")
    print(f"Skipped reports: {len(skipped)}")
    print(f"✅ Recovered: {success}")
    print(f"❌ Still missing: {failed}")

    if success > 0:
        print(f"\n🎯 Recovery: {(success/len(skipped))*100:.1f}%")
        print(f"\n📊 Updated stats:")
        print(f"   Original: 1263/3215 (39.3%)")
        print(f"   New: {1263 + success}/3215 ({(1263+success)/3215*100:.1f}%)")

    # Save
    if fuzzy_matches:
        with open('recovered_fixtures.txt', 'w') as f:
            f.write("RECOVERED FIXTURES\n" + "="*80 + "\n\n")
            for m in fuzzy_matches:
                f.write(f"SEARCHED: {m['search']}\n")
                f.write(f"MATCHED: {m['matched']}\n")
                f.write(f"DATE: {m['date']}\n")
                f.write(f"SIMILARITY: {m['similarity']}\n")
                f.write(f"FIXTURES: {m['fixture_count']}\n")
                f.write("-"*80 + "\n\n")
        print(f"\n💾 Saved recovered_fixtures.txt")

    cursor.close()
    conn.close()
    print("\n✓ Complete!")


if __name__ == "__main__":
    main()
