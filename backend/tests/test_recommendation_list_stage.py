"""The recommendations queue shows each linked player's furthest first-team list stage to list viewers."""
import os
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import main


def _item(item_id, source=None, player_id=None, cafc_id=None):
    return SimpleNamespace(
        id=item_id,
        linked_player_data_source=source,
        linked_player_id=player_id,
        linked_cafc_player_id=cafc_id,
        list_stage=None,
        list_stage_lists=None,
    )


def _attach(items, rows, role=main.ROLE_ADMIN):
    cursor = MagicMock()
    cursor.fetchall.return_value = rows
    with patch.object(main, "ensure_player_lists_category_column"):
        main.attach_recommendation_list_stages(cursor, items, role)
    return cursor


def test_picks_the_furthest_active_stage_and_the_lists_holding_it():
    external = _item(1, "external", player_id=50)
    internal = _item(2, "internal", player_id=999, cafc_id=7)
    _attach([external, internal], [
        (50, None, "Stage 2", "LW"),
        (50, None, "Stage 4", "RW"),
        (50, None, "Stage 4", "CF"),
        (None, 7, "Archived", "CM"),
        (None, 7, "Stage 1", "DM"),
    ])
    assert external.list_stage == "Stage 4"
    assert external.list_stage_lists == ["CF", "RW"]
    assert internal.list_stage == "Stage 1"
    assert internal.list_stage_lists == ["DM"]


def test_archived_only_and_unlisted_players():
    archived = _item(1, "external", player_id=50)
    unlisted = _item(2, "external", player_id=60)
    unlinked = _item(3)
    _attach([archived, unlisted, unlinked], [(50, None, "Archived", "LB")])
    assert archived.list_stage == "Archived"
    assert unlisted.list_stage is None
    assert unlinked.list_stage is None


def test_scoped_to_first_team_lists():
    cursor = _attach([_item(1, "external", player_id=50)], [])
    assert "LIST_CATEGORY = 'first_team'" in cursor.execute.call_args.args[0]


def test_roles_without_list_access_get_no_stage():
    for role in [main.ROLE_SCOUT, main.ROLE_LOAN_MANAGER, main.ROLE_INTEL_REVIEWER]:
        item = _item(1, "external", player_id=50)
        cursor = _attach([item], [(50, None, "Stage 3", "RW")], role=role)
        cursor.execute.assert_not_called()
        assert item.list_stage is None
