"""Routing and fail-closed checks without a database connection."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pytest
import main
import canonical_players


def test_native_routing_covers_players_and_snapshot_dependency(monkeypatch):
    monkeypatch.setattr(main, 'NATIVE_PLAYER_READS', True)
    monkeypatch.setattr(main, 'CANONICAL_DB', 'CAFC_DB')
    monkeypatch.setattr(main, 'CORE_DB_SCHEMA', 'CORE_DEV_CODEX_PLAYERS')
    for name in ['players', 'players_base', 'PLAYERS']:
        sql = main.read_table(name)
        assert 'APP_COMPAT' not in sql and 'IMPECT_RAW' not in sql
        assert 'CAFC_DB.CORE_DEV_CODEX_PLAYERS.PLAYERS c' in sql
    assert 'APP_COMPAT' not in main.squad_current_competition_sql()


def test_legacy_routing_is_preserved(monkeypatch):
    monkeypatch.setattr(main, 'NATIVE_PLAYER_READS', False)
    monkeypatch.setattr(main, 'READ_PREFIX', 'RECRUITMENT_TEST.PUBLIC')
    assert main.read_table('players') == 'RECRUITMENT_TEST.PUBLIC.players'


@pytest.mark.parametrize('schema', ['RECRUITMENT_TEST.PUBLIC', 'CAFC_DB.APP_COMPAT', 'CAFC_DB.CORE;DROP TABLE X'])
def test_invalid_native_target_rejected(schema):
    with pytest.raises(ValueError):
        canonical_players.projection(schema)


class Cursor:
    def __init__(self, counts):
        self.counts = iter(counts)
    def execute(self, sql):
        pass
    def fetchone(self):
        return (next(self.counts),)


def test_conflicting_identity_blocks_activation():
    with pytest.raises(RuntimeError, match='identities disagree'):
        canonical_players.validate(Cursor([1]), 'CAFC_DB.CORE')


@pytest.mark.parametrize('position', range(4))
def test_duplicate_join_key_blocks_activation(position):
    with pytest.raises(RuntimeError, match='duplicate keys'):
        canonical_players.validate(Cursor([0] + [0]*position + [1]), 'CAFC_DB.CORE')


def test_clean_keys_allow_activation():
    canonical_players.validate(Cursor([0]*5), 'CAFC_DB.CORE')


def test_projection_schema_metadata(monkeypatch):
    monkeypatch.setattr(main, 'NATIVE_PLAYER_READS', True)
    monkeypatch.setattr(main, 'CANONICAL_DB', 'CAFC_DB')
    monkeypatch.setattr(main, 'CORE_DB_SCHEMA', 'CORE')
    class MetadataCursor:
        description = [('PLAYERID',), ('CAFC_PLAYER_ID',)]
        def execute(self, sql):
            assert sql.startswith('SELECT * FROM (SELECT')
            assert sql.endswith('LIMIT 0')
    assert main.describe_read_columns(MetadataCursor(), 'players') == ['PLAYERID', 'CAFC_PLAYER_ID']


def test_recommendation_lifecycle_metadata_stays_on_core(monkeypatch):
    monkeypatch.setattr(main, 'CANONICAL_DB', 'CAFC_DB')
    monkeypatch.setattr(main, 'CORE_DB_SCHEMA', 'CORE')
    class Cursor:
        def execute(self, sql):
            assert sql == 'DESCRIBE TABLE CAFC_DB.CORE.lifecycle_mutex'
        def fetchall(self):
            return [('ID',)]
    assert main.describe_read_columns(Cursor(), 'lifecycle_mutex') == ['ID']
