#!/usr/bin/env python3
"""
Test script to debug analytics endpoints
"""
import sys
import traceback
from main import get_snowflake_connection
import snowflake.connector

def test_players_endpoint():
    """Test all queries from /analytics/players endpoint"""
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor(snowflake.connector.DictCursor)

        months = 6
        date_filter = f"AND sr.CREATED_AT >= DATEADD(month, -{months}, CURRENT_DATE())"
        position_filter = ""

        print("=" * 60)
        print("Testing /analytics/players endpoint queries...")
        print("=" * 60)

        # Test 1: Total Player Assessments
        print("\n[1/15] Testing total player assessments...")
        cursor.execute(f"""
            SELECT COUNT(*) as total_assessments
            FROM scout_reports sr
            WHERE REPORT_TYPE = 'Player Assessment'
            {date_filter}
            {position_filter}
        """)
        result = cursor.fetchone()
        print(f"✓ Total assessments: {result['TOTAL_ASSESSMENTS']}")

        # Test 11: Monthly Reports Timeline (the one we changed)
        print("\n[11/15] Testing monthly reports timeline...")
        cursor.execute(f"""
            SELECT
                TO_CHAR(DATE_TRUNC('MONTH', sr.CREATED_AT), 'YYYY-MM') as month,
                COALESCE(SUM(CASE WHEN sr.REPORT_TYPE = 'Player Assessment' THEN 1 ELSE 0 END), 0) as assessments,
                COALESCE(SUM(CASE WHEN sr.REPORT_TYPE = 'Flag' THEN 1 ELSE 0 END), 0) as flags
            FROM scout_reports sr
            WHERE (sr.REPORT_TYPE = 'Player Assessment' OR sr.REPORT_TYPE = 'Flag')
            {date_filter}
            {position_filter}
            GROUP BY DATE_TRUNC('MONTH', sr.CREATED_AT)
            ORDER BY month ASC
        """)

        monthly_reports_timeline = []
        for row in cursor.fetchall():
            assessments = row['ASSESSMENTS'] or 0
            flags = row['FLAGS'] or 0
            monthly_reports_timeline.append({
                "month": row['MONTH'] or '',
                "assessments": assessments,
                "flags": flags,
                "total": assessments + flags
            })
        print(f"✓ Monthly timeline: {len(monthly_reports_timeline)} months")
        print(f"  Sample: {monthly_reports_timeline[0] if monthly_reports_timeline else 'No data'}")

        print("\n✅ All /analytics/players queries passed!")

    except Exception as e:
        print(f"\n❌ ERROR in /analytics/players: {e}")
        traceback.print_exc()
        return False
    finally:
        if conn:
            conn.close()

    return True


def test_matches_teams_endpoint():
    """Test all queries from /analytics/matches-teams endpoint"""
    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor(snowflake.connector.DictCursor)

        months = 6
        date_filter = f"AND sr.CREATED_AT >= DATEADD(month, -{months}, CURRENT_DATE())"

        print("\n" + "=" * 60)
        print("Testing /analytics/matches-teams endpoint queries...")
        print("=" * 60)

        # Test 1: Team Coverage
        print("\n[1/7] Testing team coverage...")
        cursor.execute(f"""
            WITH team_reports AS (
                SELECT m.HOMESQUADNAME as team_name, sr.ID, sr.SCOUTING_TYPE
                FROM scout_reports sr
                INNER JOIN matches m ON sr.MATCH_ID = m.ID
                WHERE m.HOMESQUADNAME IS NOT NULL {date_filter}
                UNION ALL
                SELECT m.AWAYSQUADNAME as team_name, sr.ID, sr.SCOUTING_TYPE
                FROM scout_reports sr
                INNER JOIN matches m ON sr.MATCH_ID = m.ID
                WHERE m.AWAYSQUADNAME IS NOT NULL {date_filter}
            )
            SELECT
                COALESCE(team_name, 'Unknown Team') as team_name,
                COUNT(ID) as total_reports,
                COALESCE(SUM(CASE WHEN UPPER(SCOUTING_TYPE) = 'LIVE' THEN 1 ELSE 0 END), 0) as live_reports,
                COALESCE(SUM(CASE WHEN UPPER(SCOUTING_TYPE) = 'VIDEO' THEN 1 ELSE 0 END), 0) as video_reports
            FROM team_reports
            GROUP BY team_name
            ORDER BY total_reports DESC
        """)
        team_coverage = []
        for row in cursor.fetchall():
            team_coverage.append({
                "team_name": row['TEAM_NAME'] or "Unknown Team",
                "total_reports": row['TOTAL_REPORTS'] or 0,
                "live_reports": row['LIVE_REPORTS'] or 0,
                "video_reports": row['VIDEO_REPORTS'] or 0
            })
        print(f"✓ Team coverage: {len(team_coverage)} teams")

        print("\n✅ All /analytics/matches-teams queries passed!")

    except Exception as e:
        print(f"\n❌ ERROR in /analytics/matches-teams: {e}")
        traceback.print_exc()
        return False
    finally:
        if conn:
            conn.close()

    return True


if __name__ == "__main__":
    print("Starting analytics endpoint tests...\n")

    players_ok = test_players_endpoint()
    matches_ok = test_matches_teams_endpoint()

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"/analytics/players: {'✅ PASS' if players_ok else '❌ FAIL'}")
    print(f"/analytics/matches-teams: {'✅ PASS' if matches_ok else '❌ FAIL'}")

    sys.exit(0 if (players_ok and matches_ok) else 1)
