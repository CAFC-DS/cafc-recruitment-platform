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

print("=" * 100)
print("FIXING DUPLICATE MATCHES")
print("=" * 100)

# Issue 1: Western United FC vs Sydney FC - internal duplicate
print("\n" + "=" * 80)
print("1. WESTERN UNITED FC vs SYDNEY FC - Internal Duplicate")
print("=" * 80)

print("\nMerging internal duplicates:")
print("  Keep: CAFC_ID 2101 (11 reports)")
print("  Delete: CAFC_ID 1801 (0 reports)")

# Check reports on 1801
cursor.execute("""
    SELECT COUNT(*)
    FROM scout_reports
    WHERE MATCH_ID = 1801
""")
reports_1801 = cursor.fetchone()[0]

if reports_1801 > 0:
    print(f"\n  Migrating {reports_1801} reports from 1801 to 2101...")
    cursor.execute("""
        UPDATE scout_reports
        SET MATCH_ID = 2101
        WHERE MATCH_ID = 1801
    """)
    print(f"  ✓ Migrated {cursor.rowcount} reports")
else:
    print(f"\n  No reports to migrate from 1801")

# Delete match 1801
print("\n  Deleting internal match 1801...")
cursor.execute("""
    DELETE FROM matches
    WHERE CAFC_MATCH_ID = 1801
      AND DATA_SOURCE = 'internal'
""")

if cursor.rowcount > 0:
    print(f"  ✓ Deleted internal match 1801")
else:
    print(f"  ✗ Failed to delete internal match 1801")

conn.commit()

# Issue 2: Notts County vs FC Barnsley - internal-external duplicate
print("\n" + "=" * 80)
print("2. NOTTS COUNTY vs FC BARNSLEY - Internal-External Duplicate")
print("=" * 80)

print("\nMigrating to external match:")
print("  From: Internal CAFC_ID 2601 (8 reports)")
print("  To: External ID 228717")

# Check reports on internal match
cursor.execute("""
    SELECT COUNT(*)
    FROM scout_reports
    WHERE MATCH_ID = 2601
""")
reports_2601 = cursor.fetchone()[0]

if reports_2601 > 0:
    print(f"\n  Migrating {reports_2601} reports from internal 2601 to external 228717...")
    cursor.execute("""
        UPDATE scout_reports
        SET MATCH_ID = 228717
        WHERE MATCH_ID = 2601
    """)
    print(f"  ✓ Migrated {cursor.rowcount} reports")
else:
    print(f"\n  No reports to migrate from 2601")

# Delete internal match 2601
print("\n  Deleting internal match 2601...")
cursor.execute("""
    DELETE FROM matches
    WHERE CAFC_MATCH_ID = 2601
      AND DATA_SOURCE = 'internal'
""")

if cursor.rowcount > 0:
    print(f"  ✓ Deleted internal match 2601")
else:
    print(f"  ✗ Failed to delete internal match 2601")

conn.commit()

print("\n" + "=" * 100)
print("VERIFICATION")
print("=" * 100)

# Verify Western United FC vs Sydney FC
print("\nVerifying Western United FC vs Sydney FC...")
cursor.execute("""
    SELECT COUNT(*)
    FROM matches
    WHERE DATA_SOURCE = 'internal'
      AND HOMESQUADNAME = 'Western United FC'
      AND AWAYSQUADNAME = 'Sydney FC'
""")
remaining_western = cursor.fetchone()[0]

cursor.execute("""
    SELECT COUNT(*)
    FROM scout_reports
    WHERE MATCH_ID = 2101
""")
reports_2101 = cursor.fetchone()[0]

if remaining_western == 1:
    print(f"  ✓ Only 1 internal match remains (CAFC_ID 2101)")
    print(f"  ✓ Reports on CAFC_ID 2101: {reports_2101}")
else:
    print(f"  ✗ {remaining_western} internal matches found (expected 1)")

# Verify Notts County vs FC Barnsley
print("\nVerifying Notts County vs FC Barnsley...")
cursor.execute("""
    SELECT COUNT(*)
    FROM matches
    WHERE DATA_SOURCE = 'internal'
      AND HOMESQUADNAME = 'Notts County'
      AND AWAYSQUADNAME = 'FC Barnsley'
""")
remaining_notts = cursor.fetchone()[0]

cursor.execute("""
    SELECT COUNT(*)
    FROM scout_reports
    WHERE MATCH_ID = 228717
""")
reports_228717 = cursor.fetchone()[0]

if remaining_notts == 0:
    print(f"  ✓ Internal match removed")
    print(f"  ✓ Reports on external ID 228717: {reports_228717}")
else:
    print(f"  ✗ {remaining_notts} internal matches still found (expected 0)")

# Summary
print("\n" + "=" * 100)
print("SUMMARY")
print("=" * 100)

cursor.execute("""
    SELECT COUNT(*) as total
    FROM matches
    WHERE DATA_SOURCE = 'internal'
""")
total_internal = cursor.fetchone()[0]

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

print(f"\nInternal matches remaining: {total_internal}")
print(f"Scout reports on internal matches: {internal_reports}")
print(f"Scout reports on external matches: {external_reports}")

cursor.close()
conn.close()

print("\n" + "=" * 100)
print("COMPLETE")
print("=" * 100)
