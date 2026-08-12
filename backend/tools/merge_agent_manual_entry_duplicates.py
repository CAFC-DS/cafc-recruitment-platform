"""
One-off cleanup script: merges the specific agent-portal manual-entry
duplicate players identified during the duplicate-players-fix investigation
(see docs/superpowers/plans/... for the plan; this isn't part of the
prevention feature itself, just a backlog cleanup pass).

Each pair below was confirmed by direct query to share an exact normalized
name AND an exact date of birth against a genuinely synced (IMPECT-sourced)
player, with the manual-entry row identifiable by having no COMPETITIONNAME/
ITERATIONID (fields only a real sync populates). The General Clashes admin
UI's O(n²) same-source comparison doesn't reliably surface these specific
pairs at this table's scale, so this script calls the exact same
merge_players() function the admin UI's "Merge" button calls (reassigns all
FK references - scout_reports, player_information, player_notes,
player_list_items, player_list_flags, player_recommendations - onto the
surviving player, then deletes the losing row) rather than hand-rolling SQL.

Usage:
    python tools/merge_agent_manual_entry_duplicates.py            # dry run
    python tools/merge_agent_manual_entry_duplicates.py --apply    # commit

Run from the backend/ directory with the same .env this app already uses.
"""
import argparse
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import main as app_main  # noqa: E402

# (manual-entry PLAYERID, synced/real PLAYERID, name — for logging only)
PAIRS = [
    (357615, 162314, "Ivan Cedric"),
    (343071, 278339, "Robin Van Cruijsen"),
    (343076, 290439, "Alex McAlister"),
    (343077, 204492, "Enzo Mayilla"),
    (343078, 136082, "Stredair Appuah"),
    (343079, 119117, "Mahamadou Diawara"),
]


async def run(apply: bool) -> None:
    fake_admin = app_main.User(id=0, username="cleanup-script", role="admin")

    for manual_id, real_id, name in PAIRS:
        keep = f"external_{real_id}"
        remove = f"external_{manual_id}"
        print(f"{'APPLYING' if apply else 'DRY RUN'}: merge {name} — keep {keep}, remove {remove}")
        if not apply:
            continue
        try:
            result = await app_main.merge_players(
                keep_universal_id=keep,
                remove_universal_id=remove,
                current_user=fake_admin,
            )
            print(f"  -> {result}")
        except Exception as e:
            print(f"  -> FAILED: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Actually commit the merges (default: dry run)")
    args = parser.parse_args()
    asyncio.run(run(args.apply))
