"""Safety conditions for the narrowly scoped migration-duplicate correction."""
import sys
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/normalisation'))
from reconcile_player_duplicates import require_safe_plan, statements, apply, rollback


@pytest.fixture
def plan():
    return {'pairs':[{'duplicate':1354027,'survivor':1329814,'profiles_equal':True,
        'identity_bags_equal':True,'survivor_active':True,'sources':[{'system':'IMPECT',
        'source_id':'109214','resolved_ids':[1329814],'override_ids':[]}]}],'references':[]}


@pytest.mark.parametrize('field',['profiles_equal','identity_bags_equal','survivor_active'])
def test_changed_evidence_refused(plan,field):
    plan['pairs'][0][field]=False
    with pytest.raises(ValueError):require_safe_plan(plan)


@pytest.mark.parametrize('field,ids',[('resolved_ids',[1354027]),('resolved_ids',[1329814,1354027]),
                                   ('override_ids',[1354027])])
def test_conflicting_or_duplicate_resolution_refused(plan,field,ids):
    plan['pairs'][0]['sources'][0][field]=ids
    with pytest.raises(ValueError):require_safe_plan(plan)


@pytest.mark.parametrize('column,key',[('CANONICAL_PLAYER_ID','1354027'),('PLAYER_ID','1354027'),
                                     ('LINKED_UNIVERSAL_ID','internal_1354027')])
def test_any_retiring_reference_requires_separate_migration(plan,column,key):
    plan['references']=[{'object':'CAFC_DB.CORE.PLAYER_INFORMATION','column':column,'counts':{key:1}}]
    with pytest.raises(ValueError,match='live canonical reference'):require_safe_plan(plan)


def test_preserves_history_and_pins_existing_survivor(plan):
    require_safe_plan(plan)
    sql=list(statements(plan,'CAFC_DB.CORE_DEV_CODEX_TEST'))
    assert len(sql)==2
    assert 'PLAYER_IDENTITY_OVERRIDES' in sql[0][0] and sql[0][1][2]==1329814
    assert 'IS_ACTIVE=FALSE' in sql[1][0] and sql[1][1]==(1354027,)
    assert all('DELETE' not in query and 'UPDATE CAFC_DB.CORE_DEV_CODEX_TEST.PLAYER_IDENTITIES' not in query for query,_ in sql)


def test_production_apply_impossible():
    with pytest.raises(ValueError,match='CORE_DEV_CODEX'):
        apply(None,'CORE')


def test_rollback_rejects_wrong_schema_or_unreviewed_pairs(plan):
    plan['schema']='CAFC_DB.CORE_DEV_CODEX_OTHER'
    with pytest.raises(ValueError,match='different schema'):
        rollback(None,'CORE_DEV_CODEX_TEST',plan)
    plan['schema']='CAFC_DB.CORE_DEV_CODEX_TEST'
    with pytest.raises(ValueError,match='reviewed five pairs'):
        rollback(None,'CORE_DEV_CODEX_TEST',plan)
