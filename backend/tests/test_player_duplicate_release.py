import sys
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/normalisation'))
import player_duplicate_release as release


def test_production_target_requires_explicit_opt_in():
    with pytest.raises(ValueError):release.target('CORE')
    assert release.target('CORE',True)=='CAFC_DB.CORE'
    with pytest.raises(ValueError):release.target('APP_COMPAT',True)


def test_unreviewed_pair_set_cannot_be_restored():
    with pytest.raises(ValueError,match='pair set'):
        release.assert_baseline({'schema':'CAFC_DB.CORE','pairs':[]},'CAFC_DB.CORE')


def test_additional_provider_identity_requires_review(monkeypatch):
    monkeypatch.setattr(release.correction,'require_safe_plan',lambda result:None)
    pairs=[{'duplicate':d,'survivor':s,'sources':[]} for d,s in release.correction.PAIRS]
    with pytest.raises(ValueError,match='source set changed'):
        release.assert_baseline({'schema':'CAFC_DB.CORE','pairs':pairs},'CAFC_DB.CORE')
