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
print("HANDLING DUPLICATE MATCHES")
print("=" * 100)

# Duplicate internal matches to remove
duplicates = [
    {'internal_id': 2801, 'external_id': 227117, 'description': 'Birmingham City U18 vs Reading U18'},
    {'internal_id': 3901, 'external_id': 186635, 'description': 'Kawasaki Frontale vs Kashiwa Reysol'}
]

for dup in duplicates:
    print(f"\n{'=' * 80}")
    print(f"Processing duplicate: {dup['description']}")
    print(f"Internal ID: {dup['internal_id']}, External ID: {dup['external_id']}")
    print(f"{'=' * 80}")

    internal_id = dup['internal_id']
    external_id = dup['external_id']

    # Check what needs to be migrated
    # For internal matches, scout_reports.MATCH_ID = matches.CAFC_MATCH_ID
    cursor.execute("""
        SELECT COUNT(*)
        FROM scout_reports sr
        INNER JOIN matches m ON sr.MATCH_ID = m.CAFC_MATCH_ID
        WHERE m.CAFC_MATCH_ID = %s AND m.DATA_SOURCE = 'internal'
    """, (internal_id,))
    report_count = cursor.fetchone()[0]

    print(f"\nFound {report_count} scout reports linked to internal match {internal_id}")

    if report_count > 0:
        print(f"Migrating {report_count} scout reports to external match {external_id}...")

        # Update scout reports to point to external match
        # Change MATCH_ID from internal CAFC_MATCH_ID to external ID
        cursor.execute("""
            UPDATE scout_reports
            SET MATCH_ID = %s
            WHERE MATCH_ID = %s
        """, (external_id, internal_id))

        print(f"  ✓ Migrated {cursor.rowcount} scout reports")

    # Now delete the internal match
    print(f"\nDeleting internal match {internal_id}...")
    cursor.execute("""
        DELETE FROM matches
        WHERE CAFC_MATCH_ID = %s
          AND DATA_SOURCE = 'internal'
    """, (internal_id,))

    if cursor.rowcount > 0:
        print(f"  ✓ Deleted internal match {internal_id}")
    else:
        print(f"  ✗ Failed to delete internal match {internal_id}")

conn.commit()
print("\n✓ Duplicate matches handled successfully")

print("\n" + "=" * 100)
print("VERIFICATION")
print("=" * 100)

# Verify duplicates removed
print("\nVerifying duplicate matches removed...")
cursor.execute("""
    SELECT COUNT(*)
    FROM matches
    WHERE DATA_SOURCE = 'internal'
      AND CAFC_MATCH_ID IN (2801, 3901)
""")
remaining_dupes = cursor.fetchone()[0]
if remaining_dupes == 0:
    print("✓ Duplicate matches successfully removed")
else:
    print(f"✗ {remaining_dupes} duplicate matches still exist")

# Verify scout reports migrated
print("\nVerifying scout reports migrated to external matches...")
for dup in duplicates:
    cursor.execute("""
        SELECT COUNT(*)
        FROM scout_reports
        WHERE MATCH_ID = %s
    """, (dup['external_id'],))
    count = cursor.fetchone()[0]
    print(f"  External match {dup['external_id']} ({dup['description']}): {count} reports")

cursor.close()
conn.close()

print("\n" + "=" * 100)
print("COMPLETE")
print("=" * 100)
