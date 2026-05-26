import snowflake.connector
import os
from pathlib import Path
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

# Load .env from backend directory
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

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

    # First, let's see the schema
    cursor.execute("DESCRIBE TABLE MATCHES")
    schema = cursor.fetchall()
    print("\nMATCHES table schema:")
    for col in schema:
        print(f"  {col[0]}: {col[1]}")
    print()

    # Query for INTERNAL matches with report counts
    # For internal matches, MATCH_ID in scout_reports = CAFC_MATCH_ID in matches
    query = """
    SELECT
        m.CAFC_MATCH_ID as match_id,
        m.HOMESQUADNAME,
        m.AWAYSQUADNAME,
        m.HOMESQUADID,
        m.AWAYSQUADID,
        DATE(m.SCHEDULEDDATE) as fixture_date,
        COUNT(sr.ID) as report_count
    FROM MATCHES m
    LEFT JOIN SCOUT_REPORTS sr ON sr.MATCH_ID = m.CAFC_MATCH_ID
    WHERE m.DATA_SOURCE = 'internal'
    GROUP BY m.CAFC_MATCH_ID, m.HOMESQUADNAME, m.AWAYSQUADNAME, m.HOMESQUADID, m.AWAYSQUADID, DATE(m.SCHEDULEDDATE)
    ORDER BY DATE(m.SCHEDULEDDATE) DESC
    """

    cursor.execute(query)
    results = cursor.fetchall()

    print(f"\n{'='*120}")
    print(f"INTERNAL MATCHES WITH REPORT COUNTS")
    print(f"{'='*120}\n")
    print(f"{'ID':<6} {'Date':<12} {'Home Team':<25} {'HomeID':<8} {'Away Team':<25} {'AwayID':<8} {'Reports':<8}")
    print(f"{'-'*120}")

    total_matches = 0
    total_reports = 0

    for row in results:
        match_id, home, away, home_id, away_id, fixture_date, report_count = row
        total_matches += 1
        total_reports += report_count

        date_str = str(fixture_date) if fixture_date else "N/A"
        home_str = (home[:22] + "...") if home and len(home) > 25 else (home or "N/A")
        away_str = (away[:22] + "...") if away and len(away) > 25 else (away or "N/A")
        home_id_str = str(home_id) if home_id else "NULL"
        away_id_str = str(away_id) if away_id else "NULL"

        print(f"{match_id:<6} {date_str:<12} {home_str:<25} {home_id_str:<8} {away_str:<25} {away_id_str:<8} {report_count:<8}")

    print(f"{'-'*120}")
    print(f"\nTotal Internal Matches: {total_matches}")
    print(f"Total Reports Assigned: {total_reports}")
    print()

    # Now check for unique team names to help with fixing naming issues
    print("\n" + "="*120)
    print("UNIQUE TEAM NAMES IN INTERNAL MATCHES (with their IDs)")
    print("="*120)

    cursor.execute("""
        SELECT DISTINCT HOMESQUADNAME, HOMESQUADID
        FROM MATCHES
        WHERE DATA_SOURCE = 'internal' AND HOMESQUADNAME IS NOT NULL
        UNION
        SELECT DISTINCT AWAYSQUADNAME, AWAYSQUADID
        FROM MATCHES
        WHERE DATA_SOURCE = 'internal' AND AWAYSQUADNAME IS NOT NULL
        ORDER BY 1
    """)
    teams = cursor.fetchall()

    print(f"\n{'Team Name':<40} {'Squad ID':<10}")
    print("-" * 50)
    for team_name, squad_id in teams:
        team_str = (team_name[:37] + "...") if team_name and len(team_name) > 40 else (team_name or "N/A")
        squad_id_str = str(squad_id) if squad_id else "NULL"
        print(f"{team_str:<40} {squad_id_str:<10}")

    print(f"\nTotal unique teams: {len(teams)}")
    print()

    cursor.close()
    conn.close()

if __name__ == "__main__":
    main()
