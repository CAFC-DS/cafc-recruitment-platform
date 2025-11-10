import requests
import json

# Login
login_response = requests.post(
    "http://localhost:8000/token",
    data={"username": "testuser", "password": "testpassword"}
)
token = login_response.json()["access_token"]

# Get analytics
analytics_response = requests.get(
    "http://localhost:8000/analytics/matches-teams?months=6",
    headers={"Authorization": f"Bearer {token}"}
)

data = analytics_response.json()

# Find Celtic in team_report_coverage
print("=" * 100)
print("CELTIC GLASGOW IN TEAM REPORT COVERAGE")
print("=" * 100)

team_coverage = data.get('team_report_coverage', [])
celtic_coverage = [t for t in team_coverage if 'Celtic' in t['team_name']]

if celtic_coverage:
    for team in celtic_coverage:
        print(f"\nTeam: {team['team_name']}")
        print(f"Total times covered: {team['total_times_covered']}")
        print(f"Total reports: {team['total_reports']}")
        print(f"\nScout breakdown:")

        for scout_name, scout_data in team['scout_breakdown'].items():
            print(f"  - {scout_name}:")
            print(f"      Times seen: {scout_data['times_seen']}")
            print(f"      Report count: {scout_data['report_count']}")
            print(f"      Live matches: {scout_data['live_matches']}")
            print(f"      Video matches: {scout_data['video_matches']}")
else:
    print("\nNo Celtic Glasgow found in team_report_coverage!")

# Also check if Calvin appears anywhere
print("\n" + "=" * 100)
print("ALL CALVIN CHARLTON ENTRIES")
print("=" * 100)

for team in team_coverage:
    for scout_name in team['scout_breakdown'].keys():
        if 'Calvin' in scout_name:
            scout_data = team['scout_breakdown'][scout_name]
            print(f"\n{scout_name} saw {team['team_name']}:")
            print(f"  Times seen: {scout_data['times_seen']}")
            print(f"  Report count: {scout_data['report_count']}")
