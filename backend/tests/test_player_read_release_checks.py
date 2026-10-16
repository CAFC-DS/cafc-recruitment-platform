import sys
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/normalisation'))
import main
from verify_player_read_release import ReadCursor
from verify_player_read_permissions import probe


@pytest.mark.parametrize('sql',['UPDATE X SET A=1','WITH x AS (SELECT 1) DELETE FROM X',
                              'SELECT 1; DROP TABLE X','CALL do_something()','CREATE TABLE X(A INT)'])
def test_read_rehearsal_refuses_mutations(sql):
    with pytest.raises(RuntimeError,match='refused a mutation'):
        ReadCursor(None,[],{}).execute(sql)


def test_permission_probe_rejects_unsafe_identifiers():
    with pytest.raises(ValueError):probe('/not-read','APP_ROLE;DROP','COMPUTE_WH')


def test_native_recommendations_use_one_grouped_player_join(monkeypatch):
    monkeypatch.setattr(main,'NATIVE_PLAYER_READS',True)
    monkeypatch.setattr(main,'CANONICAL_DB','CAFC_DB')
    monkeypatch.setattr(main,'CORE_DB_SCHEMA','CORE')
    monkeypatch.setattr(main,'refresh_table_schema',lambda table:None)
    columns={'players':{'PLAYERNAME','PLAYERID','CAFC_PLAYER_ID','BIRTHDATE','DATA_SOURCE'},
             'scout_reports':{'PERFORMANCE_SCORE','PLAYER_ID','CAFC_PLAYER_ID'},
             'player_recommendations':{'LINKED_UNIVERSAL_ID','PLAYER_DATE_OF_BIRTH'}}
    monkeypatch.setattr(main,'recommendation_column_exists',lambda table,column:column in columns.get(table,set()))
    sql=main.build_recommendation_select()
    assert 'GROUP BY NORMALIZE_TEXT_UDF(p.PLAYERNAME)' in sql
    assert 'npm.MATCH_PLAYER_ID' in sql and 'npm.MATCH_CAFC_PLAYER_ID' in sql
    assert 'npm.MATCH_AVG_SCORE' in sql
    assert 'WHERE NORMALIZE_TEXT_UDF(p.PLAYERNAME) = NORMALIZE_TEXT_UDF(pr.PLAYER_NAME)' not in sql
    assert "WHEN pr.LINKED_UNIVERSAL_ID LIKE 'external_%%'" in sql
