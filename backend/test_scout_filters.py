#!/usr/bin/env python3
"""
Test script for server-side scout report filters
"""
import requests
import json

BASE_URL = "http://localhost:8000"

# You'll need to update these with valid credentials
# Or extract token from your browser's localStorage
TOKEN = None  # Will be set after login

def login(username, password):
    """Login and get token"""
    response = requests.post(
        f"{BASE_URL}/token",
        data={"username": username, "password": password}
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    else:
        print(f"Login failed: {response.text}")
        return None

def test_filter(filter_name, params, token):
    """Test a specific filter"""
    print(f"\n{'='*60}")
    print(f"Testing: {filter_name}")
    print(f"Params: {params}")
    print(f"{'='*60}")

    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(
        f"{BASE_URL}/scout_reports/all",
        params=params,
        headers=headers
    )

    if response.status_code == 200:
        data = response.json()
        print(f"✅ Success!")
        print(f"Total reports: {data['total_reports']}")
        print(f"Returned reports: {len(data['reports'])}")

        if data['reports']:
            print(f"\nFirst report:")
            first = data['reports'][0]
            print(f"  Player: {first.get('player_name')}")
            print(f"  Scout: {first.get('scout_name')}")
            print(f"  Score: {first.get('performance_score')}")
            print(f"  Position: {first.get('position_played')}")
            print(f"  Type: {first.get('report_type')}")
    else:
        print(f"❌ Failed: {response.status_code}")
        print(f"Error: {response.text}")

def main():
    # Test with anonymous token or provide credentials
    print("Scout Report Filter Tests")
    print("=" * 60)

    # You need to either:
    # 1. Provide login credentials here
    # 2. Or copy a valid token from your browser

    username = input("Enter username (or press Enter to skip): ")
    if username:
        password = input("Enter password: ")
        token = login(username, password)
        if not token:
            print("Failed to login. Exiting.")
            return
    else:
        token = input("Paste your bearer token: ")

    # Test 1: Scout name filter
    test_filter(
        "Scout Name Filter - Reece Jackson",
        {"scout_name": "Reece Jackson", "limit": 100},
        token
    )

    # Test 2: Player name filter
    test_filter(
        "Player Name Filter",
        {"player_name": "Smith", "limit": 100},
        token
    )

    # Test 3: Performance scores filter
    test_filter(
        "Performance Scores Filter (8,9,10)",
        {"performance_scores": "8,9,10", "limit": 100},
        token
    )

    # Test 4: Position filter
    test_filter(
        "Position Filter - CB",
        {"position": "CB", "limit": 100},
        token
    )

    # Test 5: Report type filter
    test_filter(
        "Report Type Filter - Flag",
        {"report_type": "Flag", "limit": 100},
        token
    )

    # Test 6: Combined filters
    test_filter(
        "Combined: Scout + Performance Score",
        {"scout_name": "Reece Jackson", "performance_scores": "8,9,10", "limit": 100},
        token
    )

    print(f"\n{'='*60}")
    print("Tests completed!")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
