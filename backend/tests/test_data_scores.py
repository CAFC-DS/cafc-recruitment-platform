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


def test_parse_page_ignores_blobs_that_are_not_position_tables():
    # The scout page gained a d-physical blob (a plain dict) on 2026-11-04; future blobs must not break the read.
    html = page(ROWS).replace("</html>", blob("physical", {"meta": {"players": 1}, "rows": [[7, 1]]}) + blob("something_new", [1, 2, 3]) + "</html>")
    index = parse_page(html)
    assert sorted(index.by_player) == [7, 8]
    assert {row["position"] for row in index.rows(7)} == {"CB", "DM"}


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


def test_list_score_is_career_then_ch_index_then_none(tmp_path):
    source = tmp_path / "cafc_scout.html"
    rows = dict(ROWS, am=[[9, "C", "Club D", "Championship", "26/27", 19, 120, 96.4, 90, 102, 97.0, 90, 104, 2027.0, None, None],
                          [10, "D", "Club E", "Championship", "26/27", 18, 30, None, None, None, None, None, None, 2027.0, None, None]])
    source.write_text(page(rows))
    scores = DataScores(env={"DATA_SCORES_FILE": str(source)})
    assert scores.list_score(7) == {"kind": "career", "value": 112.5, "band": 4, "band_name": "Strong starter",
                                    "position": "DM", "season": "25/26", "seasons": 1, "min": 1800}
    assert scores.list_score(9) == {"kind": "ch_index", "value": 96.4, "band": 1, "band_name": "Squad level",
                                    "position": "AM", "season": "26/27", "seasons": None, "min": 120}
    assert scores.list_score(10) is None
    assert scores.list_score(999) is None
    assert scores.list_score(None) is None


def test_list_score_is_none_when_the_bucket_is_unavailable():
    assert DataScores(env={}).list_score(7) is None


def _recommendation_row(player_id, source):
    row = [None] * 54
    row[46], row[48] = player_id, source
    return row


@pytest.mark.parametrize("role", [main.ROLE_ADMIN, main.ROLE_SENIOR_MANAGER])
def test_recommendation_score_uses_the_linked_external_player(role):
    with patch.object(main.data_scores, "list_score", return_value={"value": 120}) as lookup:
        assert main.recommendation_data_score(_recommendation_row(7, "external"), role) == {"value": 120}
    lookup.assert_called_once_with(7)


@pytest.mark.parametrize("role", [main.ROLE_MANAGER, main.ROLE_LOAN_MANAGER, main.ROLE_SCOUT, main.ROLE_INTEL_REVIEWER, main.ROLE_AGENT])
def test_recommendation_score_is_withheld_below_senior_manager(role):
    with patch.object(main.data_scores, "list_score") as lookup:
        assert main.recommendation_data_score(_recommendation_row(7, "external"), role) is None
    lookup.assert_not_called()


def test_recommendation_score_skips_internal_and_unlinked_rows():
    with patch.object(main.data_scores, "list_score") as lookup:
        assert main.recommendation_data_score(_recommendation_row(None, "internal"), main.ROLE_ADMIN) is None
        assert main.recommendation_data_score(_recommendation_row(None, None), main.ROLE_ADMIN) is None
    lookup.assert_not_called()


def test_agent_response_model_cannot_carry_data_scores():
    assert "data_score" not in main.RecommendationResponse.model_fields
    assert "data_score" in main.InternalRecommendationResponse.model_fields


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


def test_a_failed_read_is_logged_as_an_error_so_it_shows_in_production(caplog):
    # Production logs at ERROR, so anything quieter disappears.
    with caplog.at_level("ERROR"):
        DataScores(env={}).for_player(7)
    assert "data scores: refresh failed" in caplog.text


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


# --- Technical data tab: category and metric Championship scores ---------------------------------------------------

TECH_COLUMNS = COLUMNS + ["catCh"]
# d-metrics_<position> as data-scoring python/build_metric_breakdown.py writes it.
BREAKDOWN_CATS = [{"key": "shot_threat", "metrics": [{"key": "non_pen_shot_xg_per90", "label": "Non-penalty xG per 90", "percent": False, "lower_better": False},
                                                     {"key": "kpi_SHOT_AT_GOAL_NUMBER_p90", "label": "Shots per 90", "percent": False, "lower_better": False}]},
                  {"key": "box_presence", "metrics": [{"key": "lab_ft_shot_share", "label": "First-time shot share", "percent": True, "lower_better": False}]}]


def tech_page(rows, breakdown=None, columns=TECH_COLUMNS):
    """rows: position rows; breakdown: one [value, reading, ...] cell per row, or None for a page without the blob."""
    meta = {"columns": columns, "positions": {"striker": {"label": "Striker", "categories": ["shot_threat", "box_presence"]}}}
    body = [blob("meta", meta), blob("striker", [[r[i] for r in rows] for i in range(len(columns))])]
    if breakdown is not None:
        body.append(blob("metrics_striker", {"categories": BREAKDOWN_CATS, "rows": breakdown}))
    return "<html>" + "".join(body) + "</html>"


BASE = [7, "A", "Club A", "League Two", "23/24", 25, 4626, 104.0, 98, 110, 103, 96, 110, 2024.0, 104.0, 1]
NEW_ROW = BASE + [[113.2, 94.6]]
NEW_CELL = [0.52, 122.0, 3.1, 104.4, 0.38, 94.6]


def scores_for(tmp_path, html):
    source = tmp_path / "cafc_scout.html"
    source.write_text(html)
    return DataScores(env={"DATA_SCORES_FILE": str(source)})


def test_technical_data_reads_the_metric_breakdown_blob(tmp_path):
    result = scores_for(tmp_path, tech_page([NEW_ROW], [NEW_CELL])).technical_for_player(7)
    assert result["available"]
    row = result["rows"][0]
    assert (row["position"], row["position_key"], row["season"], row["min"], row["has_metrics"]) == ("Striker", "striker", "23/24", 4626, True)
    shot, box = row["categories"]
    assert (shot["key"], shot["label"], shot["ch"], shot["band_name"]) == ("shot_threat", "Shot threat", 113.2, "Strong starter")
    assert [(m["label"], m["ch"], m["value"], m["percent"]) for m in shot["metrics"]] == [("Non-penalty xG per 90", 122.0, 0.52, False), ("Shots per 90", 104.4, 3.1, False)]
    assert [(m["key"], m["ch"], m["value"], m["percent"], m["lower_better"]) for m in box["metrics"]] == [("lab_ft_shot_share", 94.6, 0.38, True, False)]


def test_technical_data_from_a_page_without_the_breakdown_gives_categories_only(tmp_path):
    # Pages published before 22 Nov 2026 have no d-metrics blobs: categories show, metrics are None.
    result = scores_for(tmp_path, tech_page([NEW_ROW])).technical_for_player(7)
    row = result["rows"][0]
    assert [c["ch"] for c in row["categories"]] == [113.2, 94.6]
    assert all(c["metrics"] is None for c in row["categories"]) and row["has_metrics"] is False


def test_a_breakdown_that_does_not_line_up_is_ignored_not_fatal(tmp_path, caplog):
    with caplog.at_level("ERROR"):
        row = scores_for(tmp_path, tech_page([NEW_ROW], [NEW_CELL, NEW_CELL])).technical_for_player(7)["rows"][0]
    assert row["has_metrics"] is False and [c["ch"] for c in row["categories"]] == [113.2, 94.6]
    assert "ignoring metrics_striker" in caplog.text


def test_technical_data_tolerates_a_page_without_category_scores(tmp_path):
    result = scores_for(tmp_path, tech_page([BASE], columns=COLUMNS)).technical_for_player(7)
    assert [c["ch"] for c in result["rows"][0]["categories"]] == [None, None]


def test_technical_data_missing_metric_values_are_none(tmp_path):
    row = BASE + [[113.2, None]]
    cats = scores_for(tmp_path, tech_page([row], [[None, None, 3.1, 104.4, None, None]])).technical_for_player(7)["rows"][0]["categories"]
    assert cats[1]["ch"] is None and cats[1]["band_name"] is None
    assert [(m["ch"], m["value"]) for m in cats[0]["metrics"]] == [(None, None), (104.4, 3.1)]
    assert [(m["ch"], m["value"]) for m in cats[1]["metrics"]] == [(None, None)]


def test_technical_data_puts_the_headline_row_first(tmp_path):
    later = [7, "A", "Club B", "Championship", "25/26", 27, 1471, 95.0, 90, 100, 96, 90, 102, 2026.0, 104.0, 2, [93.0, 87.9]]
    rows = scores_for(tmp_path, tech_page([NEW_ROW, later], [NEW_CELL, NEW_CELL])).technical_for_player(7)["rows"]
    assert [r["season"] for r in rows] == ["25/26", "23/24"]


def test_technical_data_unknown_player_and_no_bucket(tmp_path):
    assert scores_for(tmp_path, tech_page([NEW_ROW])).technical_for_player(999)["available"] is False
    assert DataScores(env={}).technical_for_player(7) == {"available": False, "message": "Data scores are unavailable right now.", "run": None, "rows": []}


@pytest.mark.parametrize("role", [main.ROLE_MANAGER, main.ROLE_SCOUT, main.ROLE_LOAN_MANAGER, main.ROLE_INTEL_REVIEWER, main.ROLE_AGENT])
def test_technical_data_is_refused_below_senior_manager(role):
    with patch.object(main, "get_snowflake_connection") as connect, pytest.raises(HTTPException) as refused:
        asyncio.run(main.get_player_technical_data("external_7", current_user=MagicMock(role=role)))
    assert refused.value.status_code == 403
    connect.assert_not_called()


@pytest.mark.parametrize("role", [main.ROLE_ADMIN, main.ROLE_SENIOR_MANAGER])
def test_technical_data_reads_by_impect_id(role):
    connection = MagicMock()
    with patch.object(main, "get_snowflake_connection", return_value=connection), \
         patch.object(main, "find_player_by_universal_or_legacy_id", return_value=((7, "c1", "A"), "external")), \
         patch.object(main.data_scores, "technical_for_player", return_value={"available": True}) as lookup:
        assert asyncio.run(main.get_player_technical_data("external_7", current_user=MagicMock(role=role))) == {"available": True}
    lookup.assert_called_once_with(7)
    connection.close.assert_called_once()


def test_technical_data_is_not_offered_for_internal_players():
    with patch.object(main, "get_snowflake_connection", return_value=MagicMock()), \
         patch.object(main, "find_player_by_universal_or_legacy_id", return_value=((None, "c1", "A"), "internal")), \
         patch.object(main.data_scores, "technical_for_player") as lookup:
        result = asyncio.run(main.get_player_technical_data("internal_3", current_user=MagicMock(role=main.ROLE_ADMIN)))
    assert result["available"] is False and "external" in result["message"]
    lookup.assert_not_called()
