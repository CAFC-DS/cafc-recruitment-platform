from types import SimpleNamespace
import pytest
from fastapi import HTTPException
import main


@pytest.mark.parametrize('params,code', [
    ({'current_user': SimpleNamespace(role='scout')},403),
    ({'start_date':'not-a-date'},400),
    ({'start_date':'2026-02-01','end_date':'2026-01-01'},400),
    ({'stages':'Stage 9'},400),
    ({'mode':'unsupported'},400),
])
def test_invalid_requests_are_rejected_before_reading_warehouse(monkeypatch,params,code):
    def no_connection():
        raise AssertionError('Unauthorised/invalid request reached the warehouse')
    monkeypatch.setattr(main,'get_snowflake_connection',no_connection)
    kwargs={'current_user':SimpleNamespace(role=main.ROLE_ADMIN),**params}
    with pytest.raises(HTTPException) as error:
        main.get_recruitment_analytics(**kwargs)
    assert error.value.status_code==code


def test_cached_source_flows_through_endpoint_with_shared_filters(monkeypatch):
    players=[{'PLAYER_ID':1,'NAME':'Example','POSITION':'CM','CLUB':'Club','COUNTRY':'England','COMPETITION':'League'}]
    reports=[{'ID':1,'PLAYER_ID':1,'CREATED_AT':'2026-01-20','FIXTURE_KEY':1,'MODE':'Live','SCOUT':'Phil Chapple','SCOUT_ID':302}]
    monkeypatch.setattr(main,'get_cache',lambda key:(players,reports,[],[]))
    result=main.get_recruitment_analytics(current_user=SimpleNamespace(role=main.ROLE_MANAGER),start_date='2026-01-01',end_date='2026-01-31',competitions='League',countries='England',positions='CM',scouts='302',mode='live')
    assert result['summary']['players']==1
    assert result['summary']['senior_coverage']==100
    assert result['market']['players']==1
    empty=main.get_recruitment_analytics(current_user=SimpleNamespace(role=main.ROLE_MANAGER),start_date='2026-01-01',end_date='2026-01-31',competitions='Other')
    assert empty['summary']['players']==0
