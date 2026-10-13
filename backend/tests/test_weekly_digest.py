from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from weekly_digest import (
    weekly_window,
    scheduled_now,
    query_sql,
    render_digest,
    verify_recipients,
)


@pytest.mark.parametrize(
    "now,start,end",
    [
        ("2026-10-05T06:00:00+00:00", "2026-09-28T06:00:00", "2026-10-05T06:00:00"),
        ("2026-10-26T07:00:00+00:00", "2026-10-19T06:00:00", "2026-10-26T07:00:00"),
        ("2026-03-30T06:00:00+00:00", "2026-03-23T07:00:00", "2026-03-30T06:00:00"),
        ("2026-10-05T05:59:00+00:00", "2026-09-21T06:00:00", "2026-09-28T06:00:00"),
    ],
)
def test_week_window_handles_dst_and_pre_schedule(now, start, end):
    actual = weekly_window(datetime.fromisoformat(now))
    assert actual == (datetime.fromisoformat(start), datetime.fromisoformat(end))


@pytest.mark.parametrize(
    "value,result",
    [
        ("2026-10-05T06:00:00+00:00", True),
        ("2026-10-05T07:00:00+00:00", False),
        ("2026-10-26T07:00:00+00:00", True),
        ("2026-10-26T06:00:00+00:00", False),
    ],
)
def test_uk_guard(value, result):
    assert scheduled_now(datetime.fromisoformat(value)) is result


def test_query_qualifies_only_assessments_or_positive_flags():
    app = SimpleNamespace(
        core_table=lambda t: "CORE." + t, read_table=lambda t: "COMPAT." + t
    )
    sql = query_sql(app)
    assert (
        "sr.REPORT_TYPE='Player Assessment' AND TRY_TO_DOUBLE(TO_VARCHAR(sr.PERFORMANCE_SCORE)) >= 7"
        in sql
    )
    assert "sr.REPORT_TYPE='Flag' AND sr.FLAG_CATEGORY='Positive'" in sql
    assert "<> 'LOAN REPORT'" in sql and "COALESCE(sr.IS_ARCHIVED,FALSE)=FALSE" in sql
    assert "sr.CREATED_AT >= %s AND sr.CREATED_AT < %s" in sql
    assert "sr.CAFC_PLAYER_ID=p.CAFC_PLAYER_ID AND p.DATA_SOURCE='internal'" in sql


def test_grouping_and_html_escape():
    row = {
        "UNIVERSAL_ID": "external_1",
        "PLAYER_NAME": "<script>",
        "CLUB": "Club & Co",
        "POSITION": "CB",
        "REPORT_TYPE": "Player Assessment",
        "SCORE": 7.5,
        "SCOUT": "Scout",
        "SUMMARY": "<b>Good</b>",
    }
    start, end = weekly_window(datetime(2026, 10, 5, 6, tzinfo=timezone.utc))
    subject, html, count = render_digest(
        [row, {**row, "REPORT_TYPE": "Flag", "SCORE": None}],
        start,
        end,
        "https://example.com",
    )
    assert count == 1 and html.count("<h3>") == 1
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "Positive flag" in html and "Rating 7.5" in html
    assert "/player/external_1" in html


def test_empty_week_note():
    start, end = weekly_window()
    _, html, count = render_digest([], start, end, "https://example.com")
    assert count == 0 and "No recruitment players" in html


def test_recipient_role_checked():
    app = SimpleNamespace(
        core_table=lambda t: t,
        ROLE_ADMIN="admin",
        ROLE_MANAGER="manager",
        ROLE_SENIOR_MANAGER="senior_manager",
    )
    cursor = Mock()
    cursor.fetchall.return_value = [(1, "scout")]
    with pytest.raises(ValueError, match="manager"):
        verify_recipients(cursor, app, ["scout@example.com"])
    cursor.fetchall.return_value = [(1, "manager")]
    assert verify_recipients(cursor, app, ["Manager@Example.com"]) == [
        "manager@example.com"
    ]
