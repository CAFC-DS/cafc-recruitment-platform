"""Data scores: unpacking the packaged scout page, the CH bands, and who may read them."""
import asyncio
import base64
import gzip
import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import main
from services.data_scores import DataScores, band, band_name, parse_page

COLUMNS = ["id", "name", "club", "league", "season", "age", "min", "ch", "chLo", "chHi", "fc", "fcLo", "fcHi", "t", "rel", "relN"]


def blob(name, obj):
    """The way data-scoring python/package_scout.py embeds a blob."""
    text = base64.b64encode(gzip.compress(json.dumps(obj).encode())).decode()
    return f'<script type="application/octet-stream" id="d-{name}">{text}</script>'


def page(positions):
    meta = {"columns": COLUMNS, "positions": {p: {"label": p.upper()} for p in positions}}
    body = [blob("meta", meta), blob("league_view", {"leagues": []})]
    for p, rows in positions.items():  # rows -> columns, as packaged
        body.append(blob(p, [[r[i] for r in rows] for i in range(len(COLUMNS))]))
    return "<html>" + "".join(body) + "</html>"


ROWS = {
    "cb": [[7, "A", "Club A", "Championship", "24/25", 25, 3000, 110.4, 105, 115, 108, 100, 116, 2025.0, 109.0, 1],
           [7, "A", "Club B", "Championship", "25/26", 26, 900, 103.2, 96, 110, 104, 97, 112, 2026.0, 107.6, 2],
           [8, "B", "Club C", "League One", "25/26", 22, 2000, 91.5, 85, 98, 95, 88, 102, 2026.0, 93.0, 3]],
    "dm": [[7, "A", "Club B", "Championship", "25/26", 26, 1800, 117.0, 110, 123, 115, 107, 122, 2026.0, 112.5, 1]],
}


def test_parse_page_reads_column_major_blobs_by_embedded_column_names():
    index = parse_page(page(ROWS))
    assert sorted(index.by_player) == [7, 8]
    assert [(r["position"], r["season"], r["ch"]) for r in index.rows(7)] == [("CB", "24/25", 110.4), ("CB", "25/26", 103.2), ("DM", "25/26", 117.0)]
    assert index.rows(8) == [{"season": "25/26", "t": 2026.0, "league": "League One", "club": "Club C", "min": 2000, "ch": 91.5,
                              "chLo": 85.0, "chHi": 98.0, "fc": 95.0, "fcLo": 88.0, "fcHi": 102.0, "rel": 93.0, "relN": 3,
                              "position": "CB"}]
    assert index.rows(999) == []


def test_missing_scores_come_back_as_none():
    rows = {"cb": [[9, "C", "Club D", "Championship", "26/27", 19, 120, None, None, None, 97.0, 90, 104, 2027.0, None, None]]}
    row = parse_page(page(rows)).rows(9)[0]
    assert row["ch"] is None and row["fc"] == 97.0 and row["rel"] is None and row["relN"] is None


def test_bands_match_the_scout_app_including_half_points():
    # Math.round rounds halves up; Python's round() would put 97.5 and 115.5 a band lower or 91.5 into band 0.
    assert [band(v) for v in (116, 115.5, 115.4, 108, 103, 97.5, 97.4, 92, 91.5, 91.4)] == [5, 5, 4, 4, 3, 2, 1, 1, 1, 0]
    assert band(None) is None and band_name(None) is None
    assert band_name(5) == "Elite" and band_name(0) == "Below Championship level"


def test_headline_is_the_latest_season_with_the_most_minutes(tmp_path):
    source = tmp_path / "cafc_scout.html"
    source.write_text(page(ROWS))
    scores = DataScores(env={"DATA_SCORES_FILE": str(source)})
    result = scores.for_player(7)
    assert result["available"] and result["headline"]["position"] == "DM"
    assert result["headline"]["band"] == 5 and result["headline"]["fc_band_name"] == "Strong starter"
    assert result["headline"]["rel"] == 112.5 and result["headline"]["rel_band_name"] == "Strong starter"
    assert [(r["position"], r["season"]) for r in result["rows"]] == [("DM", "25/26"), ("CB", "25/26"), ("CB", "24/25")]
    assert scores.for_player(999)["available"] is False


def test_bucket_failure_keeps_the_last_good_copy(tmp_path):
    source = tmp_path / "cafc_scout.html"
    source.write_text(page(ROWS))
    scores = DataScores(env={"DATA_SCORES_FILE": str(source)})
    assert scores.for_player(8)["available"]
    source.unlink()
    scores.next_check = 0  # force a re-check
    assert scores.for_player(8)["headline"]["ch"] == 91.5


def test_failed_reads_back_off_instead_of_retrying_every_request():
    scores = DataScores(env={})
    with patch.object(scores, "_latest", side_effect=RuntimeError("bucket down")) as latest:
        scores.for_player(7)
        scores.for_player(7)
    assert latest.call_count == 1


def test_unconfigured_bucket_is_unavailable_not_an_error():
    result = DataScores(env={}).for_player(7)
    assert result == {"available": False, "message": "Data scores are unavailable right now.", "run": None, "headline": None, "rows": []}


@pytest.mark.parametrize("role", [main.ROLE_MANAGER, main.ROLE_SCOUT, main.ROLE_LOAN_MANAGER, main.ROLE_INTEL_REVIEWER, main.ROLE_AGENT])
def test_roles_below_senior_manager_are_refused(role):
    with patch.object(main, "get_snowflake_connection") as connect, pytest.raises(HTTPException) as refused:
        asyncio.run(main.get_player_data_scores("external_7", current_user=MagicMock(role=role)))
    assert refused.value.status_code == 403
    connect.assert_not_called()


@pytest.mark.parametrize("role", [main.ROLE_ADMIN, main.ROLE_SENIOR_MANAGER])
def test_senior_managers_get_scores_by_impect_id(role):
    connection = MagicMock()
    with patch.object(main, "get_snowflake_connection", return_value=connection), \
         patch.object(main, "find_player_by_universal_or_legacy_id", return_value=((7, "c1", "A"), "external")), \
         patch.object(main.data_scores, "for_player", return_value={"available": True}) as lookup:
        assert asyncio.run(main.get_player_data_scores("external_7", current_user=MagicMock(role=role))) == {"available": True}
    lookup.assert_called_once_with(7)
    connection.close.assert_called_once()
