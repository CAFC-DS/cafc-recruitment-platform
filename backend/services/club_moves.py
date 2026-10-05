"""Fixed club-move snapshot, keyed exclusively by external player identity."""
import csv
from functools import lru_cache
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parents[1] / "data" / "player_moves_since_2026-05-01_club_competitions.csv"

@lru_cache(maxsize=1)
def load_club_moves():
    with SNAPSHOT.open(encoding="utf-8-sig", newline="") as source:
        return {
            int(row["playerId"]): {
                "from_club": row["fromSquad"].strip() or None,
                "to_club": row["toSquad"].strip() or None,
                "last_old_club_appearance": row["lastAppOldClub"].strip() or None,
                "first_new_club_appearance": row["firstAppNewClub"].strip() or None,
            }
            for row in csv.DictReader(source)
        }

def get_club_move(external_player_id, category="first_team"):
    if category != "first_team" or external_player_id is None:
        return None
    return load_club_moves().get(int(external_player_id))
