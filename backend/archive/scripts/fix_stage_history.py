"""
Fix Stage History Script - Procedural Version
Updates the initial stage history reason for players without a position.

Usage:
    python fix_stage_history.py /path/to/excel_file.xlsx [--dry-run] [--yes]
"""

import pandas as pd
import requests
import sys
import argparse

# Configuration
API_BASE_URL = "http://localhost:8000"


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


def get_players_in_list(token, list_id):
    """Get all players in a list"""
    response = requests.get(
        f"{API_BASE_URL}/player-lists/{list_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    response.raise_for_status()
    return response.json().get('players', [])


def get_player_item_id(token, list_id, player_id, is_cafc_player=False):
    """Get player's item_id in a list"""
    players = get_players_in_list(token, list_id)
    for player in players:
        if is_cafc_player:
            if player.get('cafc_player_id') == player_id:
                return player['item_id']
        else:
            if player.get('player_id') == player_id:
                return player['item_id']
    return None


def get_stage_history(token, list_id, item_id):
    """Get stage history for a player"""
    response = requests.get(
        f"{API_BASE_URL}/player-lists/{list_id}/players/{item_id}/stage-history",
        headers={"Authorization": f"Bearer {token}"}
    )
    response.raise_for_status()
    return response.json().get('history', [])


def update_stage_history(token, list_id, item_id, history_id, new_reason, dry_run=False):
    """Update a stage history entry's reason"""
    if dry_run:
        print(f"      [DRY RUN] Would update history {history_id} to reason: {new_reason}")
        return True

    try:
        response = requests.put(
            f"{API_BASE_URL}/player-lists/{list_id}/players/{item_id}/stage-history/{history_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "reason": new_reason,
                "description": "Corrected initial reason"
            }
        )
        response.raise_for_status()
        return True
    except Exception as e:
        print(f"      ✗ Error: {str(e)}")
        return False


def normalize_reason(reason):
    """Normalize reason formatting"""
    reason = reason.replace(" By ", " by ")
    if reason == "Flagged by Recommendation":
        reason = "Flagged by External Recommendation"
    return reason


def main():
    parser = argparse.ArgumentParser(description='Fix stage history reasons for players without position')
    parser.add_argument('excel_file', help='Path to Excel file with player mappings')
    parser.add_argument('--dry-run', action='store_true', help='Preview without executing')
    parser.add_argument('--yes', '-y', action='store_true', help='Skip confirmation')
    parser.add_argument('--username', default='admin', help='Username')
    parser.add_argument('--password', default='admin', help='Password')

    args = parser.parse_args()

    print("=" * 80)
    print("FIX STAGE HISTORY - PROCEDURAL VERSION")
    print("=" * 80)

    # Authenticate
    try:
        token = get_token(args.username, args.password)
    except Exception as e:
        print(f"❌ Authentication failed: {str(e)}")
        sys.exit(1)

    # Read Excel file
    print(f"\n📖 Reading Excel file...")
    df = pd.read_excel(args.excel_file, header=1)
    print(f"   Found {len(df)} total players")

    # Filter to players WITHOUT position
    df_to_fix = df[df['POSITION'].isna()].copy()
    print(f"   ✓ {len(df_to_fix)} players without position (need reason fix)")

    if len(df_to_fix) == 0:
        print("\n✓ No players need fixing!")
        return

    # Get all unique list names and player counts
    list_groups = df_to_fix.groupby('LIST_NAME')
    print(f"\n📋 Breakdown:")
    for list_name, group in sorted(list_groups, key=lambda x: x[0]):
        print(f"   • {list_name}: {len(group)} players")

    if not args.dry_run and not args.yes:
        confirm = input("\n⚠️  Proceed with fixing stage history? (yes/no): ")
        if confirm.lower() != 'yes':
            print("❌ Operation cancelled")
            sys.exit(0)

    print("\n" + "=" * 80)
    print("FIXING STAGE HISTORY")
    print("=" * 80)

    success_count = 0
    skip_count = 0
    error_count = 0

    # Process each list
    for list_name in sorted(df_to_fix['LIST_NAME'].unique()):
        list_players = df_to_fix[df_to_fix['LIST_NAME'] == list_name]

        # Get list ID
        list_id = get_list_id(token, list_name)
        if not list_id:
            print(f"\n⚠️  List '{list_name}' not found, skipping {len(list_players)} players")
            skip_count += len(list_players)
            continue

        print(f"\n📝 Processing {list_name} list ({len(list_players)} players)...")

        for idx, row in list_players.iterrows():
            # Get player ID
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
            expected_reason = normalize_reason(row['REASON'])

            # Skip "Moved Club"
            if expected_reason == "Moved Club":
                print(f"      ⊘ {player_name} ({id_display}) - Skipping 'Moved Club'")
                skip_count += 1
                continue

            print(f"      • {player_name} ({id_display})", end=" ")

            # Get item_id
            item_id = get_player_item_id(token, list_id, player_id, is_cafc_player)
            if not item_id:
                print("- Not found in list")
                skip_count += 1
                continue

            # Get stage history
            history = get_stage_history(token, list_id, item_id)
            if not history:
                print("- No history found")
                skip_count += 1
                continue

            # Find first (oldest) entry - history is DESC, so last item is oldest
            first_entry = history[-1]
            current_reason = first_entry.get('reason', '')
            history_id = first_entry.get('id')

            if current_reason == expected_reason:
                print(f"✓ Already correct ({expected_reason})")
                skip_count += 1
            else:
                print(f"- Updating: '{current_reason}' → '{expected_reason}'", end=" ")
                if update_stage_history(token, list_id, item_id, history_id, expected_reason, args.dry_run):
                    print("✓")
                    success_count += 1
                else:
                    print("✗")
                    error_count += 1

    # Summary
    print("\n" + "=" * 80)
    print("FIX COMPLETE")
    print("=" * 80)
    print(f"✓ Successfully updated: {success_count}")
    print(f"⊘ Already correct/skipped: {skip_count}")
    print(f"✗ Errors: {error_count}")

    if args.dry_run:
        print("\n⚠️  This was a DRY RUN - no changes were made")


if __name__ == "__main__":
    main()
