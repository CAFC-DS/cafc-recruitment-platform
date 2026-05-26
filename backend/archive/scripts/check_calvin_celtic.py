import snowflake.connector
import os
from dotenv import load_dotenv
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

print('Finding all Celtic Glasgow matches with scout reports...')
print('=' * 100)

# Find all Celtic reports by Calvin Charlton
cursor.execute("""
    SELECT
        sr.ID,
        sr.MATCH_ID,
        m.HOMESQUADNAME,
        m.AWAYSQUADNAME,
        m.DATA_SOURCE,
        m.SCHEDULEDDATE,
        COALESCE(m.ID, m.CAFC_MATCH_ID) as unique_match_id,
        COALESCE(TRIM(CONCAT(u.FIRSTNAME, ' ', u.LASTNAME)), u.USERNAME) as scout_name
    FROM scout_reports sr
    INNER JOIN matches m ON (
        (sr.MATCH_ID = m.ID AND m.DATA_SOURCE = 'external') OR
        (sr.MATCH_ID = m.CAFC_MATCH_ID AND m.DATA_SOURCE = 'internal')
    )
    LEFT JOIN users u ON sr.USER_ID = u.ID
    WHERE (m.HOMESQUADNAME = 'Celtic Glasgow' OR m.AWAYSQUADNAME = 'Celtic Glasgow')
      AND COALESCE(TRIM(CONCAT(u.FIRSTNAME, ' ', u.LASTNAME)), u.USERNAME) LIKE '%Calvin%'
    ORDER BY m.SCHEDULEDDATE
""")

results = cursor.fetchall()

print(f'\nFound {len(results)} Celtic Glasgow reports by Calvin Charlton:\n')

for row in results:
    report_id, match_id, home, away, source, date, unique_id, scout = row
    print(f'Report {report_id} | Match ID: {match_id} | Unique ID: {unique_id} | [{source.upper()}]')
    print(f'  {home} vs {away}')
    print(f'  Date: {date}')
    print(f'  Scout: {scout}\n')

# Check distinct matches
print('=' * 100)
print('Counting distinct matches for Calvin and Celtic...\n')

cursor.execute("""
    SELECT
        COUNT(DISTINCT COALESCE(m.ID, m.CAFC_MATCH_ID)) as distinct_matches,
        COUNT(sr.ID) as total_reports,
        COUNT(DISTINCT CASE WHEN m.DATA_SOURCE = 'external' THEN m.ID END) as external_matches,
        COUNT(DISTINCT CASE WHEN m.DATA_SOURCE = 'internal' THEN m.CAFC_MATCH_ID END) as internal_matches
    FROM scout_reports sr
    INNER JOIN matches m ON (
        (sr.MATCH_ID = m.ID AND m.DATA_SOURCE = 'external') OR
        (sr.MATCH_ID = m.CAFC_MATCH_ID AND m.DATA_SOURCE = 'internal')
    )
    LEFT JOIN users u ON sr.USER_ID = u.ID
    WHERE (m.HOMESQUADNAME = 'Celtic Glasgow' OR m.AWAYSQUADNAME = 'Celtic Glasgow')
      AND COALESCE(TRIM(CONCAT(u.FIRSTNAME, ' ', u.LASTNAME)), u.USERNAME) LIKE '%Calvin%'
""")

row = cursor.fetchone()
distinct_matches, total_reports, external_matches, internal_matches = row

print(f'Distinct Celtic matches seen by Calvin: {distinct_matches}')
print(f'  - External matches: {external_matches}')
print(f'  - Internal matches: {internal_matches}')
print(f'Total reports by Calvin on Celtic: {total_reports}')

# Now run the exact query from the analytics endpoint
print('\n' + '=' * 100)
print('RUNNING ANALYTICS QUERY (Team Coverage for Calvin + Celtic)')
print('=' * 100)

cursor.execute("""
    WITH team_scout_data AS (
        SELECT
            m.HOMESQUADNAME as team_name,
            COALESCE(m.ID, m.CAFC_MATCH_ID) as match_id,
            sr.ID as report_id,
            sr.SCOUTING_TYPE,
            COALESCE(TRIM(CONCAT(u.FIRSTNAME, ' ', u.LASTNAME)), u.USERNAME, 'Unknown Scout') as scout_name
        FROM scout_reports sr
        INNER JOIN matches m ON (
            (sr.MATCH_ID = m.ID AND m.DATA_SOURCE = 'external') OR
            (sr.MATCH_ID = m.CAFC_MATCH_ID AND m.DATA_SOURCE = 'internal')
        )
        LEFT JOIN users u ON sr.USER_ID = u.ID
        WHERE m.HOMESQUADNAME IS NOT NULL
          AND (m.DATA_SOURCE = 'external' OR (m.DATA_SOURCE = 'internal' AND m.HOMESQUADID IS NOT NULL))

        UNION ALL

        SELECT
            m.AWAYSQUADNAME as team_name,
            COALESCE(m.ID, m.CAFC_MATCH_ID) as match_id,
            sr.ID as report_id,
            sr.SCOUTING_TYPE,
            COALESCE(TRIM(CONCAT(u.FIRSTNAME, ' ', u.LASTNAME)), u.USERNAME, 'Unknown Scout') as scout_name
        FROM scout_reports sr
        INNER JOIN matches m ON (
            (sr.MATCH_ID = m.ID AND m.DATA_SOURCE = 'external') OR
            (sr.MATCH_ID = m.CAFC_MATCH_ID AND m.DATA_SOURCE = 'internal')
        )
        LEFT JOIN users u ON sr.USER_ID = u.ID
        WHERE m.AWAYSQUADNAME IS NOT NULL
          AND (m.DATA_SOURCE = 'external' OR (m.DATA_SOURCE = 'internal' AND m.AWAYSQUADID IS NOT NULL))
    )
    SELECT
        team_name,
        scout_name,
        COUNT(DISTINCT match_id) as times_seen,
        COUNT(report_id) as report_count,
        COUNT(DISTINCT CASE WHEN UPPER(SCOUTING_TYPE) = 'LIVE' THEN match_id END) as live_matches,
        COUNT(DISTINCT CASE WHEN UPPER(SCOUTING_TYPE) = 'VIDEO' THEN match_id END) as video_matches
    FROM team_scout_data
    WHERE team_name = 'Celtic Glasgow'
      AND scout_name LIKE '%Calvin%'
    GROUP BY team_name, scout_name
    ORDER BY team_name, times_seen DESC
""")

result = cursor.fetchone()
if result:
    team, scout, times_seen, reports, live, video = result
    print(f'\nTeam: {team}')
    print(f'Scout: {scout}')
    print(f'Times seen: {times_seen}')
    print(f'Report count: {reports}')
    print(f'Live matches: {live}')
    print(f'Video matches: {video}')
else:
    print('\nNo results found in analytics query!')

conn.close()

print('\n' + '=' * 100)
print('ANALYSIS COMPLETE')
print('=' * 100)
