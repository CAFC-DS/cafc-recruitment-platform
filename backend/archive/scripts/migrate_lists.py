"""
List Migration Script - Procedural Version
Migrates players to position-specific lists with proper stage history.

Usage:
    python migrate_lists.py /path/to/excel_file.xlsx [--dry-run]
"""

import pandas as pd
import requests
import sys
import argparse

# Configuration
API_BASE_URL = "http://localhost:8000"
POSITION_LISTS_TO_CLEAR = ["CCB", "LCB", "RCB", "RW", "LW", "RWB"]

# Stage 2 reasons (players with these reasons enter directly at Stage 2)
STAGE_2_REASONS = ["Flagged by Data", "Flagged by Live Scouting"]


def get_token(username, password):
    """Get authentication token"""
    print(f"\n🔐 Authenticating as {username}...")
    response = requests.post(
        f"{API_BASE_URL}/token",
        data={"username": username, "password": password}
    )
    response.raise_for_status()
    token = response.json()['access_token']
    print("   ✓ Authenticated")
    return token


def get_list_id(token, list_name):
    """Get list ID by name"""
    response = requests.get(
        f"{API_BASE_URL}/player-lists",
        headers={"Authorization": f"Bearer {token}"}
    )
    response.raise_for_status()

    for lst in response.json().get('lists', []):
        if lst['list_name'] == list_name:
            return lst['id']
    return None


def create_list(token, list_name):
    """Create a new player list"""
    response = requests.post(
        f"{API_BASE_URL}/player-lists",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "list_name": list_name,
            "description": f"Position-specific list for {list_name} players"
        }
    )
    response.raise_for_status()
    return response.json()['list_id']


def get_players_in_list(token, list_id):
    """Get all players in a list"""
    response = requests.get(
        f"{API_BASE_URL}/player-lists/{list_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    response.raise_for_status()
    return response.json().get('players', [])


def remove_player_from_list(token, list_id, item_id):
    """Remove a player from a list"""
    response = requests.delete(
        f"{API_BASE_URL}/player-lists/{list_id}/players/{item_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    # If player already gone (404), that's fine
    if response.status_code == 404:
        return True
    response.raise_for_status()
    return True


def clear_list(token, list_name, dry_run=False):
    """Remove all players from a list"""
    list_id = get_list_id(token, list_name)
    if not list_id:
        print(f"   ⊘ List '{list_name}' not found, skipping")
        return 0

    players = get_players_in_list(token, list_id)

    if dry_run:
        print(f"   [DRY RUN] Would remove {len(players)} players from {list_name}")
        return len(players)

    for player in players:
        remove_player_from_list(token, list_id, player['item_id'])

    print(f"   ✓ Cleared {len(players)} players from {list_name}")
    return len(players)


def normalize_reason(reason):
    """Normalize reason formatting"""
    reason = reason.replace(" By ", " by ")
    if reason == "Flagged by Recommendation":
        reason = "Flagged by External Recommendation"
    return reason


def determine_initial_stage(reason):
    """Determine initial stage based on reason"""
    normalized = normalize_reason(reason)
    return "Stage 2" if normalized in STAGE_2_REASONS else "Stage 1"


def get_player_item_id(token, list_id, player_id):
    """Get player's item_id in a list"""
    players = get_players_in_list(token, list_id)
    for player in players:
        if player.get('player_id') == player_id or player.get('cafc_player_id') == player_id:
            return player['item_id']
    return None


def add_player_to_list(token, list_id, player_id, current_stage, reason, is_cafc_player=False, dry_run=False):
    """Add player to list with proper stage and history"""
    normalized_reason = normalize_reason(reason)

    # Skip "Moved Club" - it's an archived-only reason
    if normalized_reason == "Moved Club":
        print(f"      ⊘ Skipping - 'Moved Club' is archived-only")
        return True

    # Determine initial stage
    initial_stage = determine_initial_stage(reason)

    if dry_run:
        id_type = "CAFC" if is_cafc_player else "External"
        print(f"      [DRY RUN] Would add at {initial_stage} (reason: {normalized_reason}, {id_type} ID)")
        if current_stage != initial_stage:
            print(f"      [DRY RUN] Would then update to {current_stage}")
        return True

    try:
        # Build payload with correct ID field
        payload = {
            "stage": initial_stage,
            "reason": normalized_reason,
            "description": "Migrated to position-specific list"
        }

        # Use cafc_player_id or player_id depending on player type
        if is_cafc_player:
            payload["cafc_player_id"] = player_id
        else:
            payload["player_id"] = player_id

        # Add player at initial stage with reason
        response = requests.post(
            f"{API_BASE_URL}/player-lists/{list_id}/players",
            headers={"Authorization": f"Bearer {token}"},
            json=payload
        )

        # Check if already in list
        if response.status_code == 400:
            if "already in this list" in response.json().get('detail', ''):
                print(f"      ⊘ Already in list")
                return True

        response.raise_for_status()

        # If current stage is different from initial, update it
        if current_stage != initial_stage:
            item_id = get_player_item_id(token, list_id, player_id)
            if not item_id:
                print(f"      ✗ Could not find player after adding")
                return False

            # Build update payload
            update_payload = {"stage": current_stage}
            if current_stage == "Archived":
                update_payload["reason"] = normalized_reason

            response = requests.put(
                f"{API_BASE_URL}/player-lists/{list_id}/players/{item_id}/stage",
                headers={"Authorization": f"Bearer {token}"},
                json=update_payload
            )
            response.raise_for_status()

        return True

    except Exception as e:
        print(f"      ✗ Error: {str(e)}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Migrate players to position-specific lists')
    parser.add_argument('excel_file', help='Path to Excel file with player mappings')
    parser.add_argument('--dry-run', action='store_true', help='Preview without executing')
    parser.add_argument('--username', default='admin', help='Username')
    parser.add_argument('--password', default='admin', help='Password')

    args = parser.parse_args()

    print("=" * 80)
    print("LIST MIGRATION - PROCEDURAL VERSION")
    print("=" * 80)

    # Authenticate
    try:
        token = get_token(args.username, args.password)
    except Exception as e:
        print(f"❌ Authentication failed: {str(e)}")
        sys.exit(1)

    # Step 1: Skip clearing (lists already empty)
    print("\n📝 Step 1: Skipping list clearing (lists already empty)")

    # Step 2: Read Excel file
    print(f"\n📖 Step 2: Reading Excel file...")
    df = pd.read_excel(args.excel_file, header=1)
    print(f"   Found {len(df)} total players")

    # Filter to players with position
    df_to_migrate = df[df['POSITION'].notna()].copy()
    print(f"   ✓ {len(df_to_migrate)} players have a position")

    # Step 3: Create/find all position lists
    print("\n📝 Step 3: Ensuring position lists exist...")
    unique_positions = df_to_migrate['POSITION'].unique()
    list_ids = {}

    for position in sorted(unique_positions):
        list_id = get_list_id(token, position)
        if list_id:
            print(f"   ✓ Found list: {position} (ID: {list_id})")
        else:
            if args.dry_run:
                print(f"   [DRY RUN] Would create list: {position}")
                list_id = -1
            else:
                list_id = create_list(token, position)
                print(f"   ✓ Created list: {position} (ID: {list_id})")
        list_ids[position] = list_id

    # Step 4: Migrate players
    print("\n👥 Step 4: Migrating players to position lists...")

    if not args.dry_run:
        confirm = input("\n⚠️  Proceed with migration? (yes/no): ")
        if confirm.lower() != 'yes':
            print("❌ Migration cancelled")
            sys.exit(0)

    success_count = 0
    error_count = 0

    # Group by position for organized output
    for position in sorted(unique_positions):
        players = df_to_migrate[df_to_migrate['POSITION'] == position]
        list_id = list_ids[position]

        print(f"\n   Migrating {len(players)} players to {position}...")

        for idx, row in players.iterrows():
            # Check which ID column has a value
            cafc_id = row['CAFC_PLAYER_ID']
            external_id = row['PLAYERID']

            if pd.notna(cafc_id):
                player_id = int(cafc_id)
                is_cafc_player = True
                id_display = f"CAFC:{player_id}"
            elif pd.notna(external_id):
                player_id = int(external_id)
                is_cafc_player = False
                id_display = str(player_id)
            else:
                print(f"      ✗ {row['PLAYERNAME']} - No player ID found")
                error_count += 1
                continue

            player_name = row['PLAYERNAME']
            current_stage = row['CURRENT_STAGE']
            reason = row['REASON']

            initial_stage = determine_initial_stage(reason)
            print(f"      • {player_name} ({id_display}): {initial_stage}→{current_stage}", end=" ")

            if add_player_to_list(token, list_id, player_id, current_stage, reason, is_cafc_player=is_cafc_player, dry_run=args.dry_run):
                success_count += 1
            else:
                error_count += 1

    # Summary
    print("\n" + "=" * 80)
    print("MIGRATION COMPLETE")
    print("=" * 80)
    print(f"✓ Successfully migrated: {success_count}")
    print(f"✗ Errors: {error_count}")

    if args.dry_run:
        print("\n⚠️  This was a DRY RUN - no changes were made")


if __name__ == "__main__":
    main()
