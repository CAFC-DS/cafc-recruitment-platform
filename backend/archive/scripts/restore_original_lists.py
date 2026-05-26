"""
Restore Original Lists Script
Re-adds players back to their original W and CB lists that were mistakenly removed.

Usage:
    python restore_original_lists.py /path/to/excel_file.xlsx --username testuser --password testpassword [--dry-run]
"""

import pandas as pd
import requests
import sys
import argparse
from typing import Dict, List

# Configuration
API_BASE_URL = "http://localhost:8000"

class ListRestorer:
    def __init__(self, excel_path: str, dry_run: bool = False):
        self.excel_path = excel_path
        self.dry_run = dry_run
        self.skip_confirm = False
        self.session = requests.Session()

        # Read Excel file
        print(f"📖 Reading Excel file: {excel_path}")
        self.df = pd.read_excel(excel_path, header=1)
        print(f"   Found {len(self.df)} players")

    def authenticate(self, username: str, password: str):
        """Authenticate with the API"""
        print(f"\n🔐 Authenticating as {username}...")
        response = self.session.post(
            f"{API_BASE_URL}/token",
            data={"username": username, "password": password}
        )
        response.raise_for_status()
        token_data = response.json()
        self.session.headers.update({"Authorization": f"Bearer {token_data['access_token']}"})
        print("   ✓ Authenticated")

    def get_list_id_by_name(self, list_name: str):
        """Get list ID by name"""
        response = self.session.get(f"{API_BASE_URL}/player-lists")
        response.raise_for_status()

        existing_lists = response.json().get('lists', [])
        for lst in existing_lists:
            if lst['list_name'] == list_name:
                return lst['id']
        return None

    def is_player_in_list(self, list_id: int, player_id: int) -> bool:
        """Check if player is already in list"""
        response = self.session.get(f"{API_BASE_URL}/player-lists/{list_id}")
        response.raise_for_status()

        list_data = response.json()
        for player in list_data.get('players', []):
            if player.get('player_id') == player_id or player.get('cafc_player_id') == player_id:
                return True
        return False

    def normalize_reason(self, reason: str) -> str:
        """Normalize reason to match backend expectations"""
        reason = reason.replace(" By ", " by ")
        if reason == "Flagged by Recommendation":
            reason = "Flagged by External Recommendation"
        return reason

    def determine_initial_stage(self, reason: str) -> str:
        """Determine initial stage based on reason"""
        normalized_reason = self.normalize_reason(reason)
        STAGE_2_REASONS = ["Flagged by Data", "Flagged by Live Scouting"]
        return "Stage 2" if normalized_reason in STAGE_2_REASONS else "Stage 1"

    def add_player_to_list(self, list_id: int, player_id: int, stage: str, reason: str, current_stage: str) -> bool:
        """Add player back to original list"""
        normalized_reason = self.normalize_reason(reason)

        # Skip archived-only reasons
        if normalized_reason == "Moved Club":
            print(f"      ⊘ Skipping player {player_id} - 'Moved Club' is archived-only")
            return True

        if self.dry_run:
            print(f"      [DRY RUN] Would add player {player_id} to list {list_id}")
            return True

        try:
            initial_stage = self.determine_initial_stage(reason)

            # Add player at initial stage
            response = self.session.post(
                f"{API_BASE_URL}/player-lists/{list_id}/players",
                json={
                    "player_id": player_id,
                    "stage": initial_stage,
                    "reason": normalized_reason,
                    "description": "Restored to original list"
                }
            )

            if response.status_code == 400:
                error_detail = response.json().get('detail', '')
                if "already in this list" in error_detail:
                    print(f"      ⊘ Player {player_id} already in list")
                    return True

            response.raise_for_status()

            # Update to current stage if needed
            if current_stage != initial_stage:
                # Query for item_id
                response = self.session.get(f"{API_BASE_URL}/player-lists/{list_id}")
                response.raise_for_status()
                list_data = response.json()

                item_id = None
                for player in list_data.get('players', []):
                    if player.get('player_id') == player_id:
                        item_id = player['item_id']
                        break

                if item_id:
                    update_payload = {"stage": current_stage}
                    if current_stage == "Archived":
                        update_payload["reason"] = normalized_reason

                    response = self.session.put(
                        f"{API_BASE_URL}/player-lists/{list_id}/players/{item_id}/stage",
                        json=update_payload
                    )
                    response.raise_for_status()

            return True

        except Exception as e:
            print(f"      ✗ Error: {str(e)}")
            return False

    def restore(self):
        """Restore original W and CB lists"""
        print("\n" + "="*80)
        print("RESTORATION PLAN")
        print("="*80)

        # Get list IDs
        w_list_id = self.get_list_id_by_name("W")
        cb_list_id = self.get_list_id_by_name("CB")

        if not w_list_id or not cb_list_id:
            print("❌ Could not find W or CB lists")
            return

        # Find all players that should be in W and CB
        w_players = self.df[self.df['LIST_NAME'] == 'W']
        cb_players = self.df[self.df['LIST_NAME'] == 'CB']

        print(f"\n📋 Players to restore:")
        print(f"   • W list: {len(w_players)} players")
        print(f"   • CB list: {len(cb_players)} players")

        if not self.dry_run and not self.skip_confirm:
            confirm = input("\n⚠️  Proceed with restoration? (yes/no): ")
            if confirm.lower() != 'yes':
                print("❌ Restoration cancelled")
                return

        print("\n" + "="*80)
        print("EXECUTING RESTORATION")
        print("="*80)

        success_count = 0
        skip_count = 0
        error_count = 0

        # Restore W list
        print(f"\n📝 Restoring W list ({len(w_players)} players)...")
        for idx, row in w_players.iterrows():
            player_id = int(row['PLAYERID'])
            player_name = row['PLAYERNAME']
            current_stage = row['CURRENT_STAGE']
            reason = row['REASON']

            print(f"   • {player_name} ({player_id})", end="")

            # Check if already in list
            if not self.dry_run and self.is_player_in_list(w_list_id, player_id):
                print(" - already in list ✓")
                skip_count += 1
                continue

            if self.add_player_to_list(w_list_id, player_id, current_stage, reason, current_stage):
                print(" ✓")
                success_count += 1
            else:
                print(" ✗")
                error_count += 1

        # Restore CB list
        print(f"\n📝 Restoring CB list ({len(cb_players)} players)...")
        for idx, row in cb_players.iterrows():
            player_id = int(row['PLAYERID'])
            player_name = row['PLAYERNAME']
            current_stage = row['CURRENT_STAGE']
            reason = row['REASON']

            print(f"   • {player_name} ({player_id})", end="")

            # Check if already in list
            if not self.dry_run and self.is_player_in_list(cb_list_id, player_id):
                print(" - already in list ✓")
                skip_count += 1
                continue

            if self.add_player_to_list(cb_list_id, player_id, current_stage, reason, current_stage):
                print(" ✓")
                success_count += 1
            else:
                print(" ✗")
                error_count += 1

        # Summary
        print("\n" + "="*80)
        print("RESTORATION COMPLETE")
        print("="*80)
        print(f"✓ Successfully restored: {success_count}")
        print(f"⊘ Already in list: {skip_count}")
        print(f"✗ Errors: {error_count}")

        if self.dry_run:
            print("\n⚠️  This was a DRY RUN - no changes were made")


def main():
    parser = argparse.ArgumentParser(description='Restore original W and CB lists')
    parser.add_argument('excel_file', help='Path to Excel file with player list mappings')
    parser.add_argument('--dry-run', action='store_true', help='Preview changes without executing')
    parser.add_argument('--yes', '-y', action='store_true', help='Skip confirmation prompt')
    parser.add_argument('--username', default='admin', help='Username for authentication')
    parser.add_argument('--password', default='admin', help='Password for authentication')

    args = parser.parse_args()

    # Create restorer
    restorer = ListRestorer(args.excel_file, dry_run=args.dry_run)
    restorer.skip_confirm = args.yes

    # Authenticate
    try:
        restorer.authenticate(args.username, args.password)
    except Exception as e:
        print(f"❌ Authentication failed: {str(e)}")
        sys.exit(1)

    # Run restoration
    try:
        restorer.restore()
    except Exception as e:
        print(f"\n❌ Restoration failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
