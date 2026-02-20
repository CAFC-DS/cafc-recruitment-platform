"""
Simple script to restore players to their original lists (W and CB)
"""
import pandas as pd
import requests
import sys

# Configuration
API_BASE_URL = "http://localhost:8000"
USERNAME = "testuser"
PASSWORD = "testpassword"
EXCEL_FILE = "/Users/hashim.umarji/Desktop/player_lists_with_age_260218 (1).xlsx"

def get_token():
    """Get authentication token"""
    print("🔐 Authenticating...")
    response = requests.post(
        f"{API_BASE_URL}/token",
        data={"username": USERNAME, "password": PASSWORD}
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

def normalize_reason(reason):
    """Fix reason formatting"""
    reason = reason.replace(" By ", " by ")
    if reason == "Flagged by Recommendation":
        reason = "Flagged by External Recommendation"
    return reason

def add_player_to_list(token, list_id, player_id, reason, stage):
    """Add player to list"""
    normalized_reason = normalize_reason(reason)

    # Skip "Moved Club" reason
    if normalized_reason == "Moved Club":
        return True

    # Determine initial stage
    if normalized_reason in ["Flagged by Data", "Flagged by Live Scouting"]:
        initial_stage = "Stage 2"
    else:
        initial_stage = "Stage 1"

    try:
        # Add player
        response = requests.post(
            f"{API_BASE_URL}/player-lists/{list_id}/players",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "player_id": player_id,
                "stage": initial_stage,
                "reason": normalized_reason,
                "description": "Restored to original list"
            }
        )

        # Check if already in list
        if response.status_code == 400:
            if "already in this list" in response.text:
                return True  # Already there, skip

        response.raise_for_status()

        # Update to current stage if needed
        if stage != initial_stage:
            # Get the player's item_id
            list_response = requests.get(
                f"{API_BASE_URL}/player-lists/{list_id}",
                headers={"Authorization": f"Bearer {token}"}
            )
            list_response.raise_for_status()

            item_id = None
            for player in list_response.json().get('players', []):
                if player.get('player_id') == player_id:
                    item_id = player['item_id']
                    break

            if item_id:
                update_payload = {"stage": stage}
                if stage == "Archived":
                    update_payload["reason"] = normalized_reason

                requests.put(
                    f"{API_BASE_URL}/player-lists/{list_id}/players/{item_id}/stage",
                    headers={"Authorization": f"Bearer {token}"},
                    json=update_payload
                ).raise_for_status()

        return True
    except Exception as e:
        print(f"   ✗ Error: {str(e)}")
        return False

def main():
    print("=" * 80)
    print("RESTORING ORIGINAL LISTS")
    print("=" * 80)

    # Read Excel file
    print(f"\n📖 Reading Excel file...")
    df = pd.read_excel(EXCEL_FILE, header=1)
    print(f"   Found {len(df)} players")

    # Get authentication token
    token = get_token()

    # Get W and CB list IDs
    w_list_id = get_list_id(token, "W")
    cb_list_id = get_list_id(token, "CB")

    if not w_list_id or not cb_list_id:
        print("❌ Error: Could not find W or CB lists")
        sys.exit(1)

    print(f"\n✓ Found W list (ID: {w_list_id})")
    print(f"✓ Found CB list (ID: {cb_list_id})")

    # Process W list players
    w_players = df[df['LIST_NAME'] == 'W']
    print(f"\n📝 Restoring W list ({len(w_players)} players)...")

    success = 0
    skip = 0
    errors = 0

    for idx, row in w_players.iterrows():
        player_id = int(row['PLAYERID'])
        player_name = row['PLAYERNAME']
        stage = row['CURRENT_STAGE']
        reason = row['REASON']

        print(f"   • {player_name} ({player_id})...", end=" ")

        result = add_player_to_list(token, w_list_id, player_id, reason, stage)
        if result:
            print("✓")
            success += 1
        else:
            print("✗")
            errors += 1

    # Process CB list players
    cb_players = df[df['LIST_NAME'] == 'CB']
    print(f"\n📝 Restoring CB list ({len(cb_players)} players)...")

    for idx, row in cb_players.iterrows():
        player_id = int(row['PLAYERID'])
        player_name = row['PLAYERNAME']
        stage = row['CURRENT_STAGE']
        reason = row['REASON']

        print(f"   • {player_name} ({player_id})...", end=" ")

        result = add_player_to_list(token, cb_list_id, player_id, reason, stage)
        if result:
            print("✓")
            success += 1
        else:
            print("✗")
            errors += 1

    # Summary
    print("\n" + "=" * 80)
    print("RESTORATION COMPLETE")
    print("=" * 80)
    print(f"✓ Successfully restored: {success}")
    print(f"✗ Errors: {errors}")

if __name__ == "__main__":
    main()
