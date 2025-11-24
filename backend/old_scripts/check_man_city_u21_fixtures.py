"""Check for Manchester City U21 vs Liverpool U21 fixtures."""
import snowflake.connector
import os
from dotenv import load_dotenv
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

load_dotenv()

def get_private_key():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    key_path = os.path.join(script_dir, os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH"))
    with open(key_path, "rb") as key:
        p_key = serialization.load_pem_private_key(key.read(), password=None, backend=default_backend())
    return p_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

pkb = get_private_key()
conn = snowflake.connector.connect(
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    user=os.getenv("SNOWFLAKE_USERNAME"),
    warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
    database=os.getenv("SNOWFLAKE_DATABASE"),
    schema=os.getenv("SNOWFLAKE_SCHEMA"),
    private_key=pkb
)

cursor = conn.cursor()

print("="*80)
print("Searching for Manchester City U21 fixtures in April 2024 and 2025")
print("="*80 + "\n")

# Search for any Manchester City U21 fixtures in April 2024/2025
query = """
    SELECT HOMESQUADNAME, AWAYSQUADNAME, SCHEDULEDDATE, DATA_SOURCE, ID, CAFC_MATCH_ID
    FROM MATCHES
    WHERE (UPPER(HOMESQUADNAME) LIKE '%MANCHESTER%CITY%U21%'
           OR UPPER(AWAYSQUADNAME) LIKE '%MANCHESTER%CITY%U21%')
    AND (SCHEDULEDDATE >= '2024-04-01' AND SCHEDULEDDATE <= '2025-05-31')
    ORDER BY SCHEDULEDDATE
"""

cursor.execute(query)
results = cursor.fetchall()

print(f"Found {len(results)} Manchester City U21 fixtures:\n")
for r in results:
    print(f"{r[2]}: {r[0]} vs {r[1]} (Source: {r[3]})")

print("\n" + "="*80)
print("Specifically checking April 25, 2024 and April 15, 2024")
print("="*80 + "\n")

# Check April 25, 2024
query = """
    SELECT HOMESQUADNAME, AWAYSQUADNAME, SCHEDULEDDATE, DATA_SOURCE
    FROM MATCHES
    WHERE DATE(SCHEDULEDDATE) = '2024-04-25'
    AND (UPPER(HOMESQUADNAME) LIKE '%MANCHESTER%CITY%'
         OR UPPER(AWAYSQUADNAME) LIKE '%MANCHESTER%CITY%'
         OR UPPER(HOMESQUADNAME) LIKE '%LIVERPOOL%'
         OR UPPER(AWAYSQUADNAME) LIKE '%LIVERPOOL%')
    ORDER BY HOMESQUADNAME
"""

cursor.execute(query)
results = cursor.fetchall()
print(f"April 25, 2024 - Found {len(results)} fixtures:")
for r in results:
    print(f"  {r[0]} vs {r[1]} (Source: {r[3]})")

print()

# Check April 15, 2024
query = """
    SELECT HOMESQUADNAME, AWAYSQUADNAME, SCHEDULEDDATE, DATA_SOURCE
    FROM MATCHES
    WHERE DATE(SCHEDULEDDATE) = '2024-04-15'
    AND (UPPER(HOMESQUADNAME) LIKE '%MANCHESTER%CITY%'
         OR UPPER(AWAYSQUADNAME) LIKE '%MANCHESTER%CITY%'
         OR UPPER(HOMESQUADNAME) LIKE '%LIVERPOOL%'
         OR UPPER(AWAYSQUADNAME) LIKE '%LIVERPOOL%')
    ORDER BY HOMESQUADNAME
"""

cursor.execute(query)
results = cursor.fetchall()
print(f"April 15, 2024 - Found {len(results)} fixtures:")
for r in results:
    print(f"  {r[0]} vs {r[1]} (Source: {r[3]})")

cursor.close()
conn.close()
