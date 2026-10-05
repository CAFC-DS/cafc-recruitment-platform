"""
/scout_reports/{id} must return the report's own player identity (universal
player_id + squad_name) so the report modal never re-resolves the player by
name, which is ambiguous for shared names (e.g. two players called Costinha).
"""
import asyncio
from datetime import date
from unittest.mock import MagicMock

import main


def _fetch_report(monkeypatch, player_row_tail):
    # Columns 0-24 of the main SELECT, followed by SQUADNAME, DATA_SOURCE,
    # PLAYER_ID, CAFC_PLAYER_ID.
    head = (
        "2026-01-01", "Costinha", date(2000, 1, 1), "Home FC", "Away FC",
        date(2026, 1, 1), "CM", "Slim", "180", "Pace", "Passing", "Summary",
        "Justification", 7, "Live", "Player Assessment", "4-3-3", 30, "Scout",
        "Player Assessment", None, None, False, False, None,
    )
    cursor = MagicMock()
    cursor.fetchone.return_value = head + player_row_tail
    cursor.fetchall.return_value = [("Passing", 3)]
    conn = MagicMock()
    conn.cursor.return_value = cursor
    monkeypatch.setattr(main, "get_snowflake_connection", lambda: conn)
    return asyncio.run(main.get_single_scout_report(1, current_user=MagicMock()))


def test_external_player_returns_universal_id_and_squad(monkeypatch):
    report = _fetch_report(monkeypatch, ("Correct Costinha FC", "external", 111, None))
    assert report["player_id"] == "external_111"
    assert report["squad_name"] == "Correct Costinha FC"


def test_internal_player_returns_universal_id_and_squad(monkeypatch):
    report = _fetch_report(monkeypatch, ("Academy", "internal", None, 222))
    assert report["player_id"] == "internal_222"
    assert report["squad_name"] == "Academy"


def test_unlinked_player_returns_no_id(monkeypatch):
    report = _fetch_report(monkeypatch, (None, None, None, None))
    assert report["player_id"] is None
    assert report["squad_name"] is None
