"""Check why specific fixtures didn't match."""
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
print("FIXTURE 1: Cercle Brugge 4:0 RWD Molenbeek on 2024-03-17")
print("="*80)
query1 = """
    SELECT HOMESQUADNAME, AWAYSQUADNAME, SCHEDULEDDATE, DATA_SOURCE
    FROM MATCHES
    WHERE DATE(SCHEDULEDDATE) = '2024-03-17'
    AND (UPPER(HOMESQUADNAME) LIKE '%CERCLE%' OR UPPER(AWAYSQUADNAME) LIKE '%CERCLE%'
         OR UPPER(HOMESQUADNAME) LIKE '%BRUGGE%' OR UPPER(AWAYSQUADNAME) LIKE '%BRUGGE%')
"""
cursor.execute(query1)
results = cursor.fetchall()
print(f"Found {len(results)} matches:")
for r in results:
    print(f"  {r[0]} vs {r[1]} on {r[2]} (Source: {r[3]})")

print("\n" + "="*80)
print("FIXTURE 2: FK Teplice 1-0 Slavia Prague on 2024-12-15")
print("="*80)
query2 = """
    SELECT HOMESQUADNAME, AWAYSQUADNAME, SCHEDULEDDATE, DATA_SOURCE
    FROM MATCHES
    WHERE DATE(SCHEDULEDDATE) = '2024-12-15'
    AND (UPPER(HOMESQUADNAME) LIKE '%TEPLICE%' OR UPPER(AWAYSQUADNAME) LIKE '%TEPLICE%'
         OR UPPER(HOMESQUADNAME) LIKE '%SLAVIA%' OR UPPER(AWAYSQUADNAME) LIKE '%SLAVIA%')
"""
cursor.execute(query2)
results = cursor.fetchall()
print(f"Found {len(results)} matches:")
for r in results:
    print(f"  {r[0]} vs {r[1]} on {r[2]} (Source: {r[3]})")

print("\n" + "="*80)
print("TESTING CURRENT MATCHING LOGIC")
print("="*80)

# Test the normalize_team_name function
def normalize_team_name(team_name):
    if not team_name:
        return []
    normalized = ' '.join(team_name.strip().upper().split())
    prefixes = ['FC ', 'AFC ', 'CF ', 'SC ', 'AC ', 'AS ', 'RC ', 'FK ']
    suffixes = [' FC', ' AFC', ' CF', ' SC', ' AC', ' AS', ' RC', ' FK',
                ' UNITED', ' CITY', ' TOWN', ' ATHLETIC', ' WANDERERS']
    variations = [normalized]
    for prefix in prefixes:
        if normalized.startswith(prefix):
            variations.append(normalized[len(prefix):])
    for suffix in suffixes:
        if normalized.endswith(suffix):
            variations.append(normalized[:-len(suffix)])
    return variations

print("\nTeam name variations:")
print(f"  'Cercle Brugge' → {normalize_team_name('Cercle Brugge')}")
print(f"  'RWD Molenbeek' → {normalize_team_name('RWD Molenbeek')}")
print(f"  'FK Teplice' → {normalize_team_name('FK Teplice')}")
print(f"  'Slavia Prague' → {normalize_team_name('Slavia Prague')}")
print(f"  'SK Slavia Prag' → {normalize_team_name('SK Slavia Prag')}")

cursor.close()
conn.close()
