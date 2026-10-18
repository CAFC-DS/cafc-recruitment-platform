"""
Agent intake player linking after Phase 5 (70aa88b) removed agent player
creation. Agents must link an existing player; the old duplicate-candidate
gate and external-player creation helpers no longer exist.
"""
import sys
import os
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main
from fastapi import HTTPException


def test_returns_picked_player_when_it_resolves():
    cursor = MagicMock()
    with patch.object(main, "find_player_by_universal_or_legacy_id",
                      return_value=({"PLAYERNAME": "Jon Smith"}, "external")) as find:
        result = main.resolve_agent_intake_player_link(
            cursor, linked_universal_id=" external_42 ", player_manual_entry=False)
    assert result == "external_42"
    find.assert_called_once_with("external_42", cursor)


def test_unresolvable_pick_falls_back_to_existing_link_on_edit():
    with patch.object(main, "find_player_by_universal_or_legacy_id", return_value=(None, None)):
        result = main.resolve_agent_intake_player_link(
            MagicMock(), linked_universal_id="external_42", player_manual_entry=False,
            existing_universal_id="internal_7")
    assert result == "internal_7"


def test_manual_entry_ignores_pick_and_keeps_existing_link():
    with patch.object(main, "find_player_by_universal_or_legacy_id") as find:
        result = main.resolve_agent_intake_player_link(
            MagicMock(), linked_universal_id="external_42", player_manual_entry=True,
            existing_universal_id="external_9")
    assert result == "external_9"
    find.assert_not_called()


@pytest.mark.parametrize("link", [None, "", "not-a-universal-id"])
def test_rejects_without_resolvable_player_or_existing_link(link):
    with patch.object(main, "find_player_by_universal_or_legacy_id", return_value=(None, None)):
        with pytest.raises(HTTPException) as exc:
            main.resolve_agent_intake_player_link(
                MagicMock(), linked_universal_id=link, player_manual_entry=False)
    assert exc.value.status_code == 400


def test_manual_entry_without_existing_link_is_rejected_not_created():
    with pytest.raises(HTTPException) as exc:
        main.resolve_agent_intake_player_link(
            MagicMock(), linked_universal_id=None, player_manual_entry=True)
    assert exc.value.status_code == 400
    assert not hasattr(main, "_create_external_player_from_agent_intake")
