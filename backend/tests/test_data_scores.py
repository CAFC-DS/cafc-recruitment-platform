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


# --- Reference boxes: own league and Championship regulars ----------------------------------------------------------

def regular(pid, league, season, t, minutes, cats, cell):
    return [pid, f"P{pid}", "Club", league, season, 24, minutes, 100.0, 95, 105, 100, 95, 105, t, 100.0, 1, cats], cell


def reference_page(extra=()):
    """21 League Two and 21 Championship regulars in 23/24 with readings 90..110, plus player 7 and any extras."""
    rows, cells = [], []
    for k in range(21):
        for league, shift in (("League Two", 0.0), ("Championship", 10.0)):
            v = 90.0 + k + shift
            row, cell = regular(100 + k * 2 + (league == "Championship"), league, "23/24", 2024.0, 1200, [v, v - 5],
                                [0.1 * k, v, 1.0 + k, v + 1, 0.3, v - 5])
            rows.append(row); cells.append(cell)
    for row, cell in [(NEW_ROW, NEW_CELL), *extra]:
        rows.append(row); cells.append(cell)
    return tech_page(rows, cells)


def test_reference_boxes_are_own_league_and_championship_quantiles(tmp_path):
    row = scores_for(tmp_path, reference_page()).technical_for_player(7)["rows"][0]
    # 21 regulars + player 7 (4,626 minutes, 113.2) in League Two; 21 in the Championship.
    own, champ = row["reference"]["own"], row["reference"]["champ"]
    assert {k: own[k] for k in ("league", "season", "n", "pooled", "same_season", "in_progress", "missing")} == \
        {"league": "League Two", "season": "23/24", "n": 22, "pooled": False, "same_season": True, "in_progress": None, "missing": False}
    assert (champ["league"], champ["season"], champ["n"]) == ("Championship", "23/24", 21)
    assert (row["reference"]["min_regulars"], row["reference"]["pool_seasons"]) == (20, 3)
    shot = row["categories"][0]
    # Championship 100..120: he (113.2) beats 100..113, 14 of 21.
    assert shot["champ"] == {"q": [102.0, 105.0, 110.0, 115.0, 118.0], "mean": 110.0, "beats": 67}
    assert shot["own"]["q"][2] == 100.5  # median of 90..110 and 113.2
    assert shot["own"]["beats"] == 95  # 21 of 22, himself excluded by "<"
    first = shot["metrics"][0]
    assert first["champ"]["q"] == [102.0, 105.0, 110.0, 115.0, 118.0] and first["champ"]["mean"] == 110.0
    assert first["champ_value"] == 1.0


def test_championship_players_get_no_own_league_box(tmp_path):
    champ_row = [7, "A", "Club B", "Championship", "23/24", 27, 2000, 95.0, 90, 100, 96, 90, 102, 2024.0, 104.0, 2, [93.0, 87.9]]
    page_html = reference_page(extra=[(champ_row, NEW_CELL)])
    rows = scores_for(tmp_path, page_html).technical_for_player(7)["rows"]
    champ = next(r for r in rows if r["league"] == "Championship")
    assert champ["reference"]["own"] is None and champ["categories"][0]["own"] is None
    assert champ["categories"][0]["champ"] is not None


def test_small_groups_get_no_box_and_seasons_fall_back_to_the_latest_full_one(tmp_path):
    # 26/27: only player 7 is a regular in League Two, a season in progress, so his boxes come from 23/24; the
    # Scottish Championship never has enough regulars, so there is no box and the tab is told why.
    current = [7, "A", "Club A", "League Two", "26/27", 26, 950, 101.0, 95, 107, 100, 95, 105, 2027.0, 104.0, 2, [101.0, 99.0]]
    scot = [7, "A", "Club C", "Scottish Championship", "22/23", 24, 2500, 99.0, 95, 103, 100, 95, 105, 2023.0, 104.0, 1, [99.0, 98.0]]
    rows = scores_for(tmp_path, reference_page(extra=[(current, NEW_CELL), (scot, NEW_CELL)])).technical_for_player(7)["rows"]
    by_season = {r["season"]: r for r in rows}
    current_own = by_season["26/27"]["reference"]["own"]
    assert (current_own["season"], current_own["in_progress"], current_own["same_season"]) == ("23/24", "26/27", False)
    scottish = by_season["22/23"]["reference"]["own"]
    assert (scottish["league"], scottish["n"], scottish["missing"]) == ("Scottish Championship", 1, True)
    assert by_season["22/23"]["categories"][0]["own"] is None
    # The Championship has no group before 23/24 either, so its latest one is used.
    assert by_season["22/23"]["reference"]["champ"]["season"] == "23/24"


def test_reference_boxes_skip_missing_readings_and_short_minutes(tmp_path):
    short = [regular(300 + k, "League Two", "23/24", 2024.0, 400, [50.0, 50.0], [None] * 6) for k in range(30)]
    row = scores_for(tmp_path, reference_page(extra=short)).technical_for_player(7)["rows"][0]
    assert row["reference"]["own"]["n"] == 22  # the 400-minute players are not regulars
    assert row["categories"][0]["own"]["q"][0] > 50


def test_quantiles_need_enough_readings():
    from services.data_scores import _quantiles
    assert _quantiles([1.0] * 19) is None
    assert _quantiles([float("nan")] * 5 + [float(v) for v in range(21)]) == [2.0, 5.0, 10.0, 15.0, 18.0]


def test_a_thin_season_in_progress_falls_back_to_the_last_complete_one(tmp_path):
    cell = [0.0, 130.0, 0.0, 130.0, 0.0, 130.0]
    season_2425 = [regular(500 + k, "Championship", "24/25", 2025.0, 950, [130.0, 130.0], cell) for k in range(20)]
    player = ([7, "A", "Club A", "League Two", "24/25", 26, 3000, 101.0, 95, 107, 100, 95, 105, 2025.0, 104.0, 2, [101.0, 99.0]], NEW_CELL)

    def champ_season(extra):
        rows = scores_for(tmp_path, reference_page(extra=extra + season_2425 + [player])).technical_for_player(7)["rows"]
        return next(r for r in rows if r["season"] == "24/25")["reference"]["champ"]

    # 20 regulars after 21 the season before: a real season, kept.
    assert {k: champ_season([])[k] for k in ("season", "n", "in_progress")} == {"season": "24/25", "n": 20, "in_progress": None}
    # 20 after 66: a season in progress, so the last complete one is used.
    more_2324 = [regular(700 + k, "Championship", "23/24", 2024.0, 2000, [100.0, 100.0], cell) for k in range(45)]
    assert {k: champ_season(more_2324)[k] for k in ("season", "n", "in_progress")} == {"season": "23/24", "n": 66, "in_progress": "24/25"}


def test_no_share_is_given_when_the_player_has_no_reading(tmp_path):
    no_reading = BASE + [[None, 94.6]]
    row = scores_for(tmp_path, reference_page(extra=[(no_reading, NEW_CELL)])).technical_for_player(7)["rows"]
    unscored = next(r for r in row if r["categories"][0]["ch"] is None)
    assert unscored["categories"][0]["own"]["beats"] is None and unscored["categories"][0]["own"]["mean"] is not None


# --- Outlook, role fit and similar players --------------------------------------------------------------------------

FULL_COLUMNS = TECH_COLUMNS + ["name", "team", "teamRel", "pCh", "pPl", "pSucc", "avail", "availN", "fit", "best"]
PROFILES = {"striker": [{"name": "Poacher", "desc": "Lives in the box."}, {"name": "Runner", "desc": "Carries the ball."}]}


def full_page(rows):
    meta = {"columns": FULL_COLUMNS, "profiles": PROFILES,
            "positions": {"striker": {"label": "Striker", "categories": ["shot_threat", "box_presence"]}}}
    body = [blob("meta", meta), blob("striker", [[r[i] for r in rows] for i in range(len(FULL_COLUMNS))])]
    return "<html>" + "".join(body) + "</html>"


def striker_row(pid, name, cats, season="23/24", t=2024.0, minutes=2000, extra=None):
    row = [pid, "x", f"Club {pid}", "League Two", season, 25, minutes, 100.0, 95, 105, 101, 94, 108, t, 99.0, 2, cats,
           name, 104.0, 6.0, 0.41, 0.12, None, 0.8, 2, [55.0, 70.0], 1]
    return row if extra is None else row[:-len(extra)] + extra


def test_outlook_scores_and_role_fit_come_with_each_row(tmp_path):
    row = scores_for(tmp_path, full_page([striker_row(7, "Player Seven", [110.0, 95.0])])).technical_for_player(7)["rows"][0]
    assert row["scores"] == {"ch": 100.0, "ch_lo": 95.0, "ch_hi": 105.0, "team": 104.0, "team_rel": 6.0, "career": 99.0,
                             "career_seasons": 2, "forecast": 101.0, "forecast_lo": 94.0, "forecast_hi": 108.0}
    assert row["outlook"] == {"starter_championship": 0.41, "starter_premier_league": 0.12, "step_up_success": None,
                              "availability": 0.8, "availability_seasons": 2}
    assert row["role_fit"] == {"best": 1, "profiles": [{"name": "Poacher", "desc": "Lives in the box.", "fit": 55.0},
                                                        {"name": "Runner", "desc": "Carries the ball.", "fit": 70.0}]}


def test_an_older_page_has_no_outlook_or_role_fit(tmp_path):
    row = scores_for(tmp_path, tech_page([NEW_ROW])).technical_for_player(7)["rows"][0]
    assert row["scores"]["team"] is None and row["outlook"]["starter_championship"] is None
    assert row["role_fit"] is None and row["similar"] == []


def test_similar_players_are_the_nearest_regulars_by_category_scores(tmp_path):
    rows = [striker_row(7, "Seven", [110.0, 95.0]),
            striker_row(8, "Close", [109.0, 96.0]),
            striker_row(9, "Far", [80.0, 120.0]),
            striker_row(10, "Closer old", [120.0, 90.0], season="22/23", t=2023.0),
            striker_row(10, "Closer new", [110.0, 95.0]),  # his latest season is the one compared
            striker_row(11, "Few minutes", [110.0, 95.0], minutes=400),
            striker_row(7, "Seven", [100.0, 100.0], season="22/23", t=2023.0)]  # never himself
    similar = scores_for(tmp_path, full_page(rows)).technical_for_player(7)["rows"][0]["similar"]
    assert [(p["impect_id"], p["name"], p["distance"]) for p in similar] == [(10, "Closer new", 0.0), (8, "Close", 1.0), (9, "Far", 27.6)]
    assert similar[1]["categories"] == [109.0, 96.0] and similar[1]["club"] == "Club 8"


def test_similar_players_link_to_profiles_the_platform_has():
    result = {"rows": [{"similar": [{"impect_id": 8, "name": None}, {"impect_id": 9, "name": "Far"}]}]}
    cursor = MagicMock()
    cursor.fetchall.return_value = [(8, "Platform Eight")]
    main._link_similar_players(result, cursor)
    assert result["rows"][0]["similar"] == [{"impect_id": 8, "name": "Platform Eight", "profile_id": "external_8"},
                                            {"impect_id": 9, "name": "Far", "profile_id": None}]
    cursor.execute.side_effect = RuntimeError("down")
    main._link_similar_players(result, cursor)  # a failed lookup leaves the list without links, not an error
    assert all(p["profile_id"] is None for p in result["rows"][0]["similar"])


def test_similar_over_recent_seasons_weights_each_players_last_three_seasons_by_minutes(tmp_path):
    rows = [striker_row(7, "Seven", [110.0, 95.0], season="25/26", t=2026.0, minutes=900),
            striker_row(7, "Seven", [100.0, 100.0], season="24/25", t=2025.0, minutes=2700),
            striker_row(7, "Seven", [50.0, 50.0], season="21/22", t=2022.0, minutes=3000),  # a fourth season back: left out
            striker_row(8, "Steady", [102.5, 98.75], season="25/26", t=2026.0, minutes=2000),
            striker_row(9, "One-season match", [110.0, 95.0], season="25/26", t=2026.0, minutes=2000),
            striker_row(9, "One-season match", [80.0, 120.0], season="24/25", t=2025.0, minutes=2000)]
    head = scores_for(tmp_path, full_page(rows)).technical_for_player(7)["rows"][0]
    # His last three seasons: (110, 95) x 900 + (100, 100) x 2700 -> (102.5, 98.75), over 3,600 minutes.
    assert head["similar_recent_basis"] == {"seasons": "24/25–25/26", "minutes": 3600, "ch": 100.0, "categories": [102.5, 98.8]}
    assert [p["name"] for p in head["similar_recent"]] == ["Steady", "One-season match"]
    assert head["similar_recent"][0]["distance"] == 0.0 and head["similar_recent"][1]["season"] == "24/25–25/26"
    assert head["similar"][0]["name"] == "One-season match"  # this season alone, the one-season match is the nearest


def test_similar_players_leave_out_players_with_no_recent_season(tmp_path):
    rows = [striker_row(7, "Seven", [110.0, 95.0], season="25/26", t=2026.0),
            striker_row(8, "Retired twin", [110.0, 95.0], season="22/23", t=2023.0),
            striker_row(9, "Last season", [100.0, 100.0], season="24/25", t=2025.0)]
    head = scores_for(tmp_path, full_page(rows)).technical_for_player(7)["rows"][0]
    assert [p["name"] for p in head["similar"]] == ["Last season"]
    assert [p["name"] for p in head["similar_recent"]] == ["Last season"]


def test_a_small_league_pools_its_recent_seasons_and_says_so(tmp_path):
    # League One centre: 12 regulars in 22/23 and 12 in 23/24, so neither season alone reaches 20.
    league_one = [regular(900 + k, "League One", season, t, 1500, [95.0 + k, 90.0], NEW_CELL)
                  for season, t in (("22/23", 2023.0), ("23/24", 2024.0)) for k in range(12)]
    player = ([7, "A", "Club A", "League One", "23/24", 25, 3000, 104.0, 98, 110, 103, 96, 110, 2024.0, 104.0, 1, [113.2, 94.6]], NEW_CELL)
    rows = scores_for(tmp_path, reference_page(extra=league_one + [player])).technical_for_player(7)["rows"]
    row = next(r for r in rows if r["league"] == "League One")
    own = row["reference"]["own"]
    assert (own["season"], own["seasons"], own["n"], own["pooled"], own["missing"]) == ("22/23–23/24", ["22/23", "23/24"], 25, True, False)
    assert row["categories"][0]["own"]["q"] is not None


def test_a_league_too_small_even_over_three_seasons_has_no_box_but_says_how_many(tmp_path):
    tiny = [regular(950 + k, "League One", season, t, 1500, [95.0, 90.0], NEW_CELL)
            for season, t in (("21/22", 2022.0), ("22/23", 2023.0), ("23/24", 2024.0)) for k in range(5)]
    player = ([7, "A", "Club A", "League One", "23/24", 25, 3000, 104.0, 98, 110, 103, 96, 110, 2024.0, 104.0, 1, [113.2, 94.6]], NEW_CELL)
    rows = scores_for(tmp_path, reference_page(extra=tiny + [player])).technical_for_player(7)["rows"]
    row = next(r for r in rows if r["league"] == "League One")
    own = row["reference"]["own"]
    assert (own["missing"], own["n"], own["season"]) == (True, 16, "21/22–23/24")
    assert all(c["own"] is None for c in row["categories"])
