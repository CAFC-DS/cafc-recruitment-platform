"""
Cleanup Script - Removes players from original lists
Run this after they've been added to new position-specific lists

Usage:
    python cleanup_original_lists.py /path/to/excel_file.xlsx --username testuser --password testpassword [--dry-run]
"""

import pandas as pd
import requests
import sys
import argparse

# Configuration
API_BASE_URL = "http://localhost:8000"

class ListCleaner:
    def __init__(self, excel_path: str, dry_run: bool = False):
        self.excel_path = excel_path
        self.dry_run = dry_run
        self.session = requests.Session()

        # Read Excel file
        print(f"📖 Reading Excel file: {excel_path}")
        self.df = pd.read_excel(excel_path, header=1)
        print(f"   Found {len(self.df)} players")

        # Filter to only players with new positions
        self.df_to_process = self.df[self.df['POSITION'].notna()].copy()
        print(f"   ✓ {len(self.df_to_process)} players to remove from original lists")

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

    def get_player_in_list(self, list_id: int, player_id: int):
        """Get player's item_id in a list"""
        response = self.session.get(f"{API_BASE_URL}/player-lists/{list_id}")
        response.raise_for_status()

        list_data = response.json()
        for player in list_data.get('players', []):
            if player.get('player_id') == player_id or player.get('cafc_player_id') == player_id:
                return player['item_id']
        return None

    def remove_player_from_list(self, list_id: int, item_id: int):
        """Remove player from list"""
        if self.dry_run:
            return True

        try:
            response = self.session.delete(
                f"{API_BASE_URL}/player-lists/{list_id}/players/{item_id}"
            )
            response.raise_for_status()
            return True
        except Exception as e:
            print(f"      ✗ Error: {str(e)}")
            return False

    def cleanup(self):
        """Remove players from original lists"""
        print("\n" + "="*80)
        print("CLEANUP: Removing players from original lists")
        print("="*80)

        # Group by original list
        list_groups = self.df_to_process.groupby('LIST_NAME')

        success_count = 0
        not_found_count = 0
        error_count = 0

        for original_list_name, players in list_groups:
            print(f"\n📋 Processing list: {original_list_name} ({len(players)} players)")

            # Get list ID
            list_id = self.get_list_id_by_name(original_list_name)
            if not list_id:
                print(f"   ⚠️  List not found: {original_list_name}")
                not_found_count += len(players)
                continue

            for idx, row in players.iterrows():
                player_id = int(row['PLAYERID'])
                player_name = row['PLAYERNAME']
                new_position = row['POSITION']

                # Get item_id
                item_id = self.get_player_in_list(list_id, player_id)
                if not item_id:
                    print(f"   ⊘ {player_name} ({player_id}) not in {original_list_name}, skipping")
                    not_found_count += 1
                    continue

                if self.dry_run:
                    print(f"   [DRY RUN] Would remove {player_name} ({player_id}) from {original_list_name} → now in {new_position}")
                    success_count += 1
                else:
                    print(f"   • Removing {player_name} ({player_id}) from {original_list_name} → now in {new_position}", end="")
                    if self.remove_player_from_list(list_id, item_id):
                        print(" ✓")
                        success_count += 1
                    else:
                        print(" ✗")
                        error_count += 1

        # Summary
        print("\n" + "="*80)
        print("CLEANUP COMPLETE")
        print("="*80)
        print(f"✓ Successfully removed: {success_count}")
        print(f"⊘ Not found in original list: {not_found_count}")
        print(f"✗ Errors: {error_count}")

        if self.dry_run:
            print("\n⚠️  This was a DRY RUN - no changes were made")


def main():
    parser = argparse.ArgumentParser(description='Remove players from original lists')
    parser.add_argument('excel_file', help='Path to Excel file with player list mappings')
    parser.add_argument('--dry-run', action='store_true', help='Preview changes without executing')
    parser.add_argument('--username', default='admin', help='Username for authentication')
    parser.add_argument('--password', default='admin', help='Password for authentication')

    args = parser.parse_args()

    # Create cleaner
    cleaner = ListCleaner(args.excel_file, dry_run=args.dry_run)

    # Authenticate
    try:
        cleaner.authenticate(args.username, args.password)
    except Exception as e:
        print(f"❌ Authentication failed: {str(e)}")
        sys.exit(1)

    # Run cleanup
    try:
        cleaner.cleanup()
    except Exception as e:
        print(f"\n❌ Cleanup failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
