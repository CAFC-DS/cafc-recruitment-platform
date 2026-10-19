"""Stage 5 mutations, analytics and atomic cohort migration regressions."""
import asyncio
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
import pytest
import main
from tools.move_stage4_to_stage5 import migrate


@pytest.mark.parametrize('bulk', [False, True])
def test_stage5_update_preserves_history_and_refreshes_counts(bulk):
    cursor = MagicMock()
    cursor.fetchone.return_value = (101, 'Stage 4', 501, None) if bulk else ('Stage 4', 501, None)
    connection = MagicMock()
    connection.cursor.return_value = cursor
    user = SimpleNamespace(id=9, role=main.ROLE_ADMIN)
    with patch.object(main, 'get_snowflake_connection', return_value=connection), \
         patch.object(main, 'insert_player_stage_history_record') as history, \
         patch.object(main, 'invalidate_cache_by_prefix') as invalidate:
        if bulk:
            payload = main.BulkStageUpdateRequest(updates=[{'item_id': 101, 'stage': 'Stage 5'}])
            result = asyncio.run(main.bulk_update_player_stages(1, payload, user))
            assert result['updated'] == 1
        else:
            payload = main.PlayerStageUpdate(stage='Stage 5')
            result = asyncio.run(main.update_player_stage(1, 101, payload, user))
            assert result['stage'] == 'Stage 5'
        assert history.call_args.kwargs['old_stage'] == 'Stage 4'
        assert history.call_args.kwargs['new_stage'] == 'Stage 5'
        invalidate.assert_called_once_with(['player_lists_all', 'analytics_stage_movements_'])


def test_stage5_analytics_contains_current_historical_and_movement_counts():
    cursor = MagicMock()
    cursor.fetchone.return_value = {'MOVED_STAGE_4_TO_5': 26, 'ARCHIVED_FROM_STAGE_5': 2}
    cursor.fetchall.side_effect = [[{'STAGE': 'Stage 5', 'PLAYER_COUNT': 26}], [{'STAGE': 'Stage 5', 'PLAYER_COUNT': 28}]]
    connection = MagicMock()
    connection.cursor.return_value = cursor
    with patch.object(main, 'get_snowflake_connection', return_value=connection), \
         patch.object(main, 'get_cache', return_value=None), \
         patch.object(main, 'set_cache'), \
         patch.object(main, 'ensure_player_lists_category_column'):
        result = asyncio.run(main.get_stage_movement_analytics(
            current_user=SimpleNamespace(role=main.ROLE_ADMIN),
            start_date='2026-01-01', end_date='2026-12-31', as_of_date=date.today().isoformat()))
    assert result['stage_counts']['Stage 5'] == 26
    assert result['stage_counts']['Stage 4'] == 0
    assert result['stage_ever_counts']['Stage 5'] == 28
    assert result['metrics']['moved_stage_4_to_5'] == 26
    assert result['metrics']['archived_from_stage_5'] == 2


@pytest.mark.parametrize('role', [main.ROLE_SCOUT, main.ROLE_MANAGER])
def test_stage5_does_not_expand_write_permissions(role):
    with patch.object(main, 'get_snowflake_connection') as connect:
        with pytest.raises(main.HTTPException) as exc:
            asyncio.run(main.update_player_stage(1, 101, main.PlayerStageUpdate(stage='Stage 5'), SimpleNamespace(role=role)))
        assert exc.value.status_code == 403
        connect.assert_not_called()


def migration_connection():
    connection = MagicMock()
    cursor = connection.cursor.return_value
    cursor.fetchone.side_effect = [('TEST', 'PUBLIC'), ('admin', 'Hashim', 'Umarji'), (0,)]
    cursor.fetchall.return_value = [(101, 1, 501, None, 'first_team', 'CB'), (102, 2, None, 502, 'emerging_talent_u21', 'CB')]
    cursor.rowcount = 1
    return connection, cursor


def test_migration_preview_is_read_only():
    connection, cursor = migration_connection()
    assert migrate(connection, table_prefix='TEST.PUBLIC') == 2
    assert all(call.args[0].strip().startswith('SELECT') for call in cursor.execute.call_args_list)


def test_migration_moves_all_categories_and_records_each_transition():
    connection, cursor = migration_connection()
    assert migrate(connection, table_prefix='TEST.PUBLIC', apply=True, changed_by=9, expected_database='TEST', expected_schema='PUBLIC', expected_count=2) == 2
    statements = [call.args[0].strip() for call in cursor.execute.call_args_list]
    assert sum(sql.startswith('INSERT INTO TEST.PUBLIC.player_stage_history') for sql in statements) == 2
    assert 'COMMIT' in statements
    assert 'ROLLBACK' not in statements


def test_migration_rolls_back_if_a_player_changed_stage():
    connection, cursor = migration_connection()
    cursor.rowcount = 0
    with pytest.raises(RuntimeError, match='Stage changed'):
        migrate(connection, table_prefix='TEST.PUBLIC', apply=True, changed_by=9, expected_database='TEST', expected_schema='PUBLIC', expected_count=2)
    statements = [call.args[0].strip() for call in cursor.execute.call_args_list]
    assert 'ROLLBACK' in statements
    assert 'COMMIT' not in statements


def test_migration_rejects_unexpected_database():
    connection, cursor = migration_connection()
    with pytest.raises(ValueError, match='Database/schema'):
        migrate(connection, table_prefix='TEST.PUBLIC', apply=True, expected_database='OTHER', expected_schema='PUBLIC', expected_count=2)
    assert len(cursor.execute.call_args_list) == 1


def test_migration_requires_hashim_attribution():
    connection, cursor = migration_connection()
    cursor.fetchone.side_effect = [('TEST', 'PUBLIC'), ('admin', 'Someone', 'Else')]
    with pytest.raises(ValueError, match='Hashim Umarji'):
        migrate(connection, table_prefix='TEST.PUBLIC', apply=True, changed_by=301,
                expected_database='TEST', expected_schema='PUBLIC', expected_count=2)
    assert 'BEGIN' not in [call.args[0] for call in cursor.execute.call_args_list]


def test_migration_records_hashim_id_and_uses_target_not_session_default():
    connection, cursor = migration_connection()
    cursor.fetchone.side_effect = [('LEGACY', 'PUBLIC'), ('admin', 'Hashim', 'Umarji'), (0,)]
    migrate(connection, table_prefix='CAFC_DB.CORE', apply=True,
            expected_database='CAFC_DB', expected_schema='CORE', expected_count=2)
    writes = [call for call in cursor.execute.call_args_list
              if call.args[0].strip().startswith('INSERT INTO')]
    assert len(writes) == 2
    assert all('CAFC_DB.CORE.player_stage_history' in call.args[0] for call in writes)
    assert all(call.args[1][-1] == 301 for call in writes)


def test_migration_rejects_changed_cohort_count():
    connection, cursor = migration_connection()
    with pytest.raises(ValueError, match='count changed'):
        migrate(connection, table_prefix='TEST.PUBLIC', apply=True, changed_by=301,
                expected_database='TEST', expected_schema='PUBLIC', expected_count=15)
    assert 'BEGIN' not in [call.args[0] for call in cursor.execute.call_args_list]


def test_migration_rolls_back_if_history_insert_fails():
    connection, cursor = migration_connection()
    def execute(sql, params=None):
        if sql.strip().startswith('INSERT INTO'):
            raise RuntimeError('history insert failed')
    cursor.execute.side_effect = execute
    with pytest.raises(RuntimeError, match='history insert failed'):
        migrate(connection, table_prefix='TEST.PUBLIC', apply=True, changed_by=301,
                expected_database='TEST', expected_schema='PUBLIC', expected_count=2)
    statements = [call.args[0].strip() for call in cursor.execute.call_args_list]
    assert 'ROLLBACK' in statements
    assert 'COMMIT' not in statements
