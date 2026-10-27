import asyncio
from types import SimpleNamespace
from unittest.mock import MagicMock
import main


class AnalyticsCursor:
    def __init__(self):
        self.sql = ''
        self.queries = []
    def execute(self, sql, *args):
        self.sql = sql
        self.queries.append(sql)
    def fetchall(self):
        if 'MAX(COMPETITIONNAME)' in self.sql:
            return [{'ITERATIONID':99999,'COMPETITION_NAME':'Current league'}]
        if 'team_totals AS' in self.sql:
            return [dict(TEAM_NAME='Example FC',SCOUT_NAME=s,UNIQUE_FIXTURES=1,TIMES_SEEN=1,REPORT_COUNT=1,LIVE_MATCHES=1,VIDEO_MATCHES=0) for s in ['Phil Chapple','Calvin Charlton']]
        if 'TO_VARCHAR(m.ITERATIONID)' in self.sql:
            return [dict(COMPETITION_NAME='99999',REPORT_COUNT=2,LIVE_REPORTS=2,VIDEO_REPORTS=0)]
        return []
    def fetchone(self):
        return {}


def test_refresh_bypasses_cache_and_preserves_visits_with_unique_fixtures(monkeypatch):
    cursor=AnalyticsCursor();conn=MagicMock();conn.cursor.return_value=cursor
    monkeypatch.setattr(main,'get_cache',lambda key:{'cached':True})
    monkeypatch.setattr(main,'get_snowflake_connection',lambda:conn)
    monkeypatch.setattr(main,'set_cache',MagicMock())
    result=asyncio.run(main.get_match_team_analytics(current_user=SimpleNamespace(role=main.ROLE_ADMIN),months=6,refresh=True))
    team=result['team_report_coverage'][0]
    assert team['unique_fixtures']==1
    assert team['total_times_covered']==2
    assert result['competition_coverage'][0]['competition_name']=='Current league'
    assert result['generated_at'].endswith('Z')
    coverage_sql=next(q for q in cursor.queries if 'team_totals AS' in q)
    assert 'HOMESQUADID IS NOT NULL' not in coverage_sql
    assert 'AWAYSQUADID IS NOT NULL' not in coverage_sql
    assert 'CONCAT(m.DATA_SOURCE' in coverage_sql
    conn.close.assert_called_once()


def test_normal_request_uses_cached_data(monkeypatch):
    monkeypatch.setattr(main,'get_cache',lambda key:{'cached':True})
    result=asyncio.run(main.get_match_team_analytics(current_user=SimpleNamespace(role=main.ROLE_MANAGER),months=6))
    assert result=={'cached':True}
