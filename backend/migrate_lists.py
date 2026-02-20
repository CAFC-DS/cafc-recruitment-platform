"""
List Migration Script
Splits existing player lists into position-specific lists while preserving stage history.

Usage:
    python migrate_lists.py /path/to/excel_file.xlsx [--dry-run] [--user-id USER_ID]

Arguments:
    excel_file: Path to the Excel file with player list mappings
    --dry-run: Preview changes without executing them
    --user-id: User ID to attribute list creation and changes to (default: 1)
"""

import pandas as pd
import requests
import sys
import argparse
from typing import Dict, List, Optional
from datetime import datetime

# Configuration
API_BASE_URL = "http://localhost:8000"
DEFAULT_USER_ID = 1  # Admin user

# Stage 2 auto-advance reasons (must match backend logic)
STAGE_2_REASONS = [
    "Flagged by Data",
    "Flagged by Live Scouting"
]

class ListMigrator:
    def __init__(self, excel_path: str, dry_run: bool = False, skip_confirm: bool = False, user_id: int = DEFAULT_USER_ID):
        self.excel_path = excel_path
        self.dry_run = dry_run
        self.skip_confirm = skip_confirm
        self.user_id = user_id
        self.session = requests.Session()
        self.new_list_ids: Dict[str, int] = {}

        # Read Excel file
        print(f"📖 Reading Excel file: {excel_path}")
        self.df = pd.read_excel(excel_path, header=1)
        print(f"   Found {len(self.df)} players")

        # Filter out rows without a new position
        self.df_to_migrate = self.df[self.df['POSITION'].notna()].copy()
        self.df_skip = self.df[self.df['POSITION'].isna()].copy()

        print(f"   ✓ {len(self.df_to_migrate)} players to migrate")
        print(f"   ⊘ {len(self.df_skip)} players without new position (will be skipped)")

    def authenticate(self, username: str, password: str):
        """Authenticate with the API"""
        print(f"\n🔐 Authenticating as {username}...")
        response = self.session.post(
            f"{API_BASE_URL}/token",
            data={"username": username, "password": password}
        )
        response.raise_for_status()
        token_data = response.json()
        # Set authorization header for all future requests
        self.session.headers.update({"Authorization": f"Bearer {token_data['access_token']}"})
        print("   ✓ Authenticated")

    def get_or_create_list(self, list_name: str) -> int:
        """Get existing list or create new one"""
        if list_name in self.new_list_ids:
            return self.new_list_ids[list_name]

        # Check if list already exists
        response = self.session.get(f"{API_BASE_URL}/player-lists")
        response.raise_for_status()

        existing_lists = response.json().get('lists', [])
        for lst in existing_lists:
            if lst['list_name'] == list_name:
                self.new_list_ids[list_name] = lst['id']
                print(f"   ✓ Found existing list: {list_name} (ID: {lst['id']})")
                return lst['id']

        # Create new list
        if self.dry_run:
            print(f"   [DRY RUN] Would create list: {list_name}")
            self.new_list_ids[list_name] = -1  # Placeholder
            return -1

        response = self.session.post(
            f"{API_BASE_URL}/player-lists",
            json={
                "list_name": list_name,
                "description": f"Position-specific list created from migration on {datetime.now().strftime('%Y-%m-%d')}"
            }
        )
        response.raise_for_status()
        list_id = response.json()['list_id']
        self.new_list_ids[list_name] = list_id
        print(f"   ✓ Created new list: {list_name} (ID: {list_id})")
        return list_id

    def get_list_id_by_name(self, list_name: str) -> Optional[int]:
        """Get list ID by name"""
        response = self.session.get(f"{API_BASE_URL}/player-lists")
        response.raise_for_status()

        existing_lists = response.json().get('lists', [])
        for lst in existing_lists:
            if lst['list_name'] == list_name:
                return lst['id']
        return None

    def get_player_in_list(self, list_id: int, player_id: int) -> Optional[int]:
        """Get player's item_id in a list"""
        response = self.session.get(f"{API_BASE_URL}/player-lists/{list_id}")
        response.raise_for_status()

        list_data = response.json()
        for player in list_data.get('players', []):
            # Check both external and internal player IDs
            if player.get('player_id') == player_id or player.get('cafc_player_id') == player_id:
                return player['item_id']
        return None

    def normalize_reason(self, reason: str) -> str:
        """Normalize reason to match backend expectations"""
        # Fix capital "By" → lowercase "by"
        reason = reason.replace(" By ", " by ")

        # Map generic "Recommendation" to "External Recommendation"
        if reason == "Flagged by Recommendation":
            reason = "Flagged by External Recommendation"

        return reason

    def determine_initial_stage(self, reason: str) -> str:
        """Determine initial stage based on reason"""
        normalized_reason = self.normalize_reason(reason)
        return "Stage 2" if normalized_reason in STAGE_2_REASONS else "Stage 1"

    def add_player_to_list(self, list_id: int, player_id: int, stage: str, reason: str, current_stage: str) -> bool:
        """Add player to list with proper initial stage"""
        universal_id = f"external_{player_id}"
        normalized_reason = self.normalize_reason(reason)

        # Skip players with "Moved Club" reason (archived-only reason, can't add players with it)
        if normalized_reason == "Moved Club":
            print(f"      ⊘ Skipping player {player_id} - 'Moved Club' is archived-only reason")
            return True  # Return True to not count as error

        if self.dry_run:
            print(f"      [DRY RUN] Would add player {player_id} to list {list_id} at {stage} (reason: {normalized_reason})")
            if current_stage != stage:
                print(f"      [DRY RUN] Would then update to {current_stage}")
            return True

        try:
            # Add player at initial stage
            response = self.session.post(
                f"{API_BASE_URL}/player-lists/{list_id}/players",
                json={
                    "player_id": player_id,
                    "stage": stage,
                    "reason": normalized_reason,
                    "description": "Migrated from original list"
                }
            )

            # If player already in list, skip silently
            if response.status_code == 400:
                error_detail = response.json().get('detail', '')
                if "already in this list" in error_detail:
                    print(f"      ⊘ Player {player_id} already in list, skipping")
                    return True  # Not an error, just skip

            response.raise_for_status()

            # Backend returns {"message": "..."}, not {"item_id": ...}
            # So we need to query for the item_id after adding
            if current_stage != stage:
                # Get the item_id for the player we just added
                item_id = self.get_player_in_list(list_id, player_id)
                if not item_id:
                    print(f"      ✗ Error: Could not find player {player_id} after adding to list")
                    return False
                # For Archived stage, backend requires a reason - use original normalized reason
                # For other stages (2, 3, 4), no reason needed (will be NULL)
                update_payload = {"stage": current_stage}
                if current_stage == "Archived":
                    update_payload["reason"] = normalized_reason  # Use normalized reason for archived

                response = self.session.put(
                    f"{API_BASE_URL}/player-lists/{list_id}/players/{item_id}/stage",
                    json=update_payload
                )
                response.raise_for_status()

            return True

        except Exception as e:
            print(f"      ✗ Error adding player {player_id}: {str(e)}")
            return False

    def remove_player_from_list(self, list_id: int, item_id: int, player_name: str) -> bool:
        """Remove player from original list"""
        if self.dry_run:
            print(f"      [DRY RUN] Would remove {player_name} from list {list_id}")
            return True

        try:
            response = self.session.delete(
                f"{API_BASE_URL}/player-lists/{list_id}/players/{item_id}"
            )
            response.raise_for_status()
            return True
        except Exception as e:
            print(f"      ✗ Error removing player: {str(e)}")
            return False

    def migrate(self):
        """Execute the migration"""
        print("\n" + "="*80)
        print("MIGRATION PLAN")
        print("="*80)

        # Show summary
        new_lists = self.df_to_migrate['POSITION'].unique()
        print(f"\n�� New lists to create: {len(new_lists)}")
        for list_name in sorted(new_lists):
            count = len(self.df_to_migrate[self.df_to_migrate['POSITION'] == list_name])
            print(f"   • {list_name}: {count} players")

        # Show players to skip
        if len(self.df_skip) > 0:
            print(f"\n⊘ Players without new position (will be skipped): {len(self.df_skip)}")

        # Confirm
        if not self.dry_run and not self.skip_confirm:
            confirm = input("\n⚠️  Proceed with migration? (yes/no): ")
            if confirm.lower() != 'yes':
                print("❌ Migration cancelled")
                return

        print("\n" + "="*80)
        print("EXECUTING MIGRATION")
        print("="*80)

        # Step 1: Create all new lists
        print("\n📝 Step 1: Creating new lists...")
        for list_name in sorted(new_lists):
            self.get_or_create_list(list_name)

        # Step 2: Migrate players
        print("\n👥 Step 2: Migrating players...")
        success_count = 0
        error_count = 0

        # Group by new position for organized output
        for new_list_name in sorted(new_lists):
            players_in_list = self.df_to_migrate[self.df_to_migrate['POSITION'] == new_list_name]
            print(f"\n   Migrating {len(players_in_list)} players to {new_list_name}...")

            list_id = self.new_list_ids[new_list_name]

            for idx, row in players_in_list.iterrows():
                player_id = int(row['PLAYERID'])
                player_name = row['PLAYERNAME']
                original_list = row['LIST_NAME']
                current_stage = row['CURRENT_STAGE']
                reason = row['REASON']

                # Determine initial stage based on reason
                initial_stage = self.determine_initial_stage(reason)

                print(f"      • {player_name} ({player_id}): {original_list} → {new_list_name} [{initial_stage}→{current_stage}]")

                # Add to new list (NOT removing from original - user requested to keep original lists)
                if self.add_player_to_list(list_id, player_id, initial_stage, reason, current_stage):
                    success_count += 1
                else:
                    error_count += 1

        # Summary
        print("\n" + "="*80)
        print("MIGRATION COMPLETE")
        print("="*80)
        print(f"✓ Successfully migrated: {success_count}")
        print(f"✗ Errors: {error_count}")
        print(f"⊘ Skipped (no new position): {len(self.df_skip)}")

        if self.dry_run:
            print("\n⚠️  This was a DRY RUN - no changes were made")
            print("   Run without --dry-run to execute the migration")


def main():
    parser = argparse.ArgumentParser(description='Migrate player lists to position-specific lists')
    parser.add_argument('excel_file', help='Path to Excel file with player list mappings')
    parser.add_argument('--dry-run', action='store_true', help='Preview changes without executing')
    parser.add_argument('--yes', '-y', action='store_true', help='Skip confirmation prompt')
    parser.add_argument('--user-id', type=int, default=DEFAULT_USER_ID, help='User ID for attribution')
    parser.add_argument('--username', default='admin', help='Username for authentication')
    parser.add_argument('--password', default='admin', help='Password for authentication')

    args = parser.parse_args()

    # Create migrator
    migrator = ListMigrator(args.excel_file, dry_run=args.dry_run, skip_confirm=args.yes, user_id=args.user_id)

    # Authenticate
    try:
        migrator.authenticate(args.username, args.password)
    except Exception as e:
        print(f"❌ Authentication failed: {str(e)}")
        sys.exit(1)

    # Run migration
    try:
        migrator.migrate()
    except Exception as e:
        print(f"\n❌ Migration failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
