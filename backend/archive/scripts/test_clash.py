import os
from dotenv import load_dotenv
import snowflake.connector
import unicodedata

load_dotenv()

def normalize_text(text):
    if not text:
        return ""
    normalized = unicodedata.normalize("NFD", text)
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn").lower()

conn = snowflake.connector.connect(
    user=os.getenv("SNOWFLAKE_USER"),
    password=os.getenv("SNOWFLAKE_PASSWORD"),
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
    database=os.getenv("SNOWFLAKE_DATABASE"),
    schema=os.getenv("SNOWFLAKE_SCHEMA"),
)

cursor = conn.cursor()

# Search for Scofield/Lonmeni
cursor.execute("""
    SELECT CAFC_PLAYER_ID, PLAYERID, PLAYERNAME, SQUADNAME, DATA_SOURCE
    FROM players
    WHERE PLAYERNAME ILIKE '%Scofield%' OR PLAYERNAME ILIKE '%Lonmeni%'
    ORDER BY PLAYERNAME
""")

results = cursor.fetchall()
print(f"\n{'='*80}")
print(f"Found {len(results)} players with Scofield/Lonmeni:")
print(f"{'='*80}\n")

from Levenshtein import distance as levenshtein_distance

players = []
for row in results:
    cafc_id, player_id, name, squad, source = row
    players.append({
        'cafc_id': cafc_id,
        'player_id': player_id, 
        'name': name,
        'squad': squad,
        'source': source
    })
    print(f"Player: {name}")
    print(f"  CAFC_ID: {cafc_id}, Player_ID: {player_id}")
    print(f"  Squad: {squad}")
    print(f"  Source: {source}")
    print()

# Now check similarity between all pairs
print(f"\n{'='*80}")
print("Checking similarities between all pairs:")
print(f"{'='*80}\n")

for i, p1 in enumerate(players):
    for p2 in players[i+1:]:
        name1 = (p1['name'] or '').lower().strip()
        name2 = (p2['name'] or '').lower().strip()
        
        if not name1 or not name2:
            continue
            
        # Check if same player
        same_cafc = p1['cafc_id'] == p2['cafc_id'] and p1['cafc_id'] is not None
        same_player_id = p1['player_id'] == p2['player_id'] and p1['player_id'] is not None
        
        len_diff = abs(len(name1) - len(name2))
        max_len = max(len(name1), len(name2))
        len_ratio = len_diff / max_len if max_len > 0 else 0
        
        dist = levenshtein_distance(name1, name2)
        similarity = (1 - (dist / max_len)) * 100 if max_len > 0 else 0
        
        print(f"Compare: '{p1['name']}' vs '{p2['name']}'")
        print(f"  Similarity: {similarity:.1f}%")
        print(f"  Same CAFC_ID: {same_cafc}, Same Player_ID: {same_player_id}")
        print(f"  Length diff ratio: {len_ratio:.2f} (threshold: 0.3)")
        print(f"  Would be detected: {similarity > 70 and not same_cafc and not same_player_id and len_ratio <= 0.3}")
        print()

cursor.close()
conn.close()
