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

print('=' * 100)
print('FIXING CF MONTRÉAL vs AUSTIN FC DUPLICATE')
print('=' * 100)

print('\nInternal match: CAFC_ID 2701 (2025-08-24) - 5 reports')
print('External match: ID 200200 (2025-08-23)')

print('\nMigrating 5 reports from internal 2701 to external 200200...')
cursor.execute("""
    UPDATE scout_reports
    SET MATCH_ID = 200200
    WHERE MATCH_ID = 2701
""")
print(f'✓ Migrated {cursor.rowcount} reports')

print('\nDeleting internal match 2701...')
cursor.execute("""
    DELETE FROM matches
    WHERE CAFC_MATCH_ID = 2701
      AND DATA_SOURCE = 'internal'
""")
print(f'✓ Deleted {cursor.rowcount} internal match(es)')

conn.commit()

print('\n' + '=' * 100)
print('VERIFICATION')
print('=' * 100)

cursor.execute('SELECT COUNT(*) FROM scout_reports WHERE MATCH_ID = 200200')
ext_reports = cursor.fetchone()[0]
print(f'\nReports on external match 200200: {ext_reports}')

cursor.execute("SELECT COUNT(*) FROM matches WHERE DATA_SOURCE = 'internal'")
internal_count = cursor.fetchone()[0]
print(f'Internal matches remaining: {internal_count}')

cursor.execute("""
    SELECT COUNT(*)
    FROM scout_reports sr
    INNER JOIN matches m ON sr.MATCH_ID = m.CAFC_MATCH_ID
    WHERE m.DATA_SOURCE = 'internal'
""")
internal_reports = cursor.fetchone()[0]

cursor.execute("""
    SELECT COUNT(*)
    FROM scout_reports sr
    INNER JOIN matches m ON sr.MATCH_ID = m.ID
    WHERE m.DATA_SOURCE = 'external'
""")
external_reports = cursor.fetchone()[0]

print(f'\nScout reports on internal matches: {internal_reports}')
print(f'Scout reports on external matches: {external_reports}')

cursor.close()
conn.close()

print('\n' + '=' * 100)
print('COMPLETE')
print('=' * 100)
