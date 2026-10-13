import asyncio
from contextlib import ExitStack
from datetime import date
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException
import main
from tests.test_agent_recommendation_edit_link import (
    _payload_stub,
    _recommendation_row,
    RECOMMENDATION_COLUMNS,
)


def call(
    status="Not Currently under Consideration",
    owner=1,
    changes="Now available on loan",
    child=None,
    player_name="Jon Smith",
    link="external_42",
    schema=True,
    player_exists=True,
):
    conn, cursor = MagicMock(), MagicMock()
    conn.cursor.return_value = cursor
    cursor.rowcount = 1
    cursor.fetchone.side_effect = [child, (99,)]
    row = list(
        _recommendation_row(
            submitted_by_user_id=owner, status=status, linked_universal_id=link
        )
    )
    row[43] = date(2000, 1, 1)
    with ExitStack() as stack:
        stack.enter_context(
            patch.object(main, "get_snowflake_connection", return_value=conn)
        )
        stack.enter_context(patch.object(main, "validate_recommendation_schema_ready"))
        stack.enter_context(
            patch.object(
                main,
                "get_table_columns",
                return_value=RECOMMENDATION_COLUMNS
                + ["PREVIOUS_RECOMMENDATION_ID", "RESUBMISSION_CHANGES"],
            )
        )
        stack.enter_context(
            patch.object(main, "recommendation_column_exists", return_value=schema)
        )
        stack.enter_context(
            patch.object(main, "fetch_recommendation_detail", return_value=tuple(row))
        )
        stack.enter_context(
            patch.object(
                main,
                "prepare_agent_recommendation_payload",
                return_value=_payload_stub(),
            )
        )
        stack.enter_context(
            patch.object(
                main,
                "find_player_by_universal_or_legacy_id",
                return_value=((1,), "external") if player_exists else (None, None),
            )
        )
        resolver = stack.enter_context(
            patch.object(main, "resolve_agent_intake_player_link")
        )
        stack.enter_context(
            patch.object(main, "serialize_recommendation_row", return_value={"id": 99})
        )
        try:
            result = asyncio.run(
                main.create_agent_recommendation(
                    agent_name="Agent",
                    agent_email="agent@example.com",
                    submission_date="2026-10-07",
                    player_name=player_name,
                    player_date_of_birth="2000-01-01",
                    current_user=main.User(id=1, username="agent", role="agent"),
                    supporting_file=None,
                    previous_recommendation_id=1,
                    resubmission_changes=changes,
                )
            )
        except HTTPException as e:
            result = e
        return result, conn, cursor, resolver


def test_new_row_preserves_link_and_original_with_history():
    result, conn, cursor, resolver = call()
    assert result == {"id": 99}
    resolver.assert_not_called()
    conn.commit.assert_called_once()
    sqls = [c.args[0] for c in cursor.execute.call_args_list]
    assert sqls[0] == "BEGIN" and "lifecycle_mutex" in sqls[1]
    insert = next(
        c
        for c in cursor.execute.call_args_list
        if "INSERT INTO" in c.args[0] and "player_recommendations" in c.args[0]
    )
    assert (
        "PREVIOUS_RECOMMENDATION_ID" in insert.args[0]
        and "RESUBMISSION_CHANGES" in insert.args[0]
    )
    assert "external_42" in insert.args[1] and insert.args[1][-2:] == (
        1,
        "Now available on loan",
    )
    assert any("status_history" in sql for sql in sqls)
    assert not any(
        sql.lstrip().startswith("UPDATE ") and "player_recommendations" in sql
        for sql in sqls
    )


@pytest.mark.parametrize(
    "kwargs,code",
    [
        ({"owner": 2}, 404),
        ({"status": "Submitted"}, 409),
        ({"status": "Under Review"}, 409),
        ({"changes": "  "}, 400),
        ({"child": (2,)}, 409),
        ({"player_name": "Different player"}, 400),
        ({"link": None}, 409),
        ({"schema": False}, 503),
        ({"player_exists": False}, 409),
    ],
)
def test_eligibility_fails_closed_without_insert(kwargs, code):
    result, conn, cursor, resolver = call(**kwargs)
    assert isinstance(result, HTTPException) and result.status_code == code
    conn.rollback.assert_called_once()
    conn.commit.assert_not_called()
    resolver.assert_not_called()
    assert not any("INSERT INTO" in c.args[0] for c in cursor.execute.call_args_list)


def test_existing_status_changes_take_mutex_without_ddl_inside_transaction():
    conn, cursor = MagicMock(), MagicMock()
    conn.cursor.return_value = cursor
    cursor.rowcount = 1
    events = []
    cursor.execute.side_effect = lambda sql, *args: events.append(sql)
    row = list(_recommendation_row(status="Not Currently under Consideration"))
    row[28] = "Old note"
    with patch.object(
        main, "get_snowflake_connection", return_value=conn
    ), patch.object(main, "validate_recommendation_schema_ready"), patch.object(
        main, "has_column", return_value=True
    ), patch.object(
        main, "fetch_recommendation_detail", return_value=tuple(row)
    ), patch.object(
        main, "serialize_recommendation_row", return_value={"id": 1}
    ), patch.object(
        main, "fetch_recommendation_status_history", return_value=[]
    ), patch.object(
        main,
        "ensure_recommendation_notes_history_table",
        side_effect=lambda c: events.append("DDL"),
    ) as ensure:
        asyncio.run(
            main.update_internal_recommendation_status(
                1,
                main.RecommendationStatusUpdateRequest(
                    new_status="Under Review", shared_notes="New note"
                ),
                main.User(id=2, username="staff", role="manager"),
            )
        )
    assert events[0:2] == ["DDL", "BEGIN"]
    assert "lifecycle_mutex" in events[2]
    ensure.assert_called_once()
    conn.commit.assert_called_once()


def test_missing_status_target_releases_mutex_with_rollback():
    conn, cursor = MagicMock(), MagicMock()
    conn.cursor.return_value = cursor
    cursor.rowcount = 1
    with patch.object(
        main, "get_snowflake_connection", return_value=conn
    ), patch.object(main, "validate_recommendation_schema_ready"), patch.object(
        main, "has_column", return_value=True
    ), patch.object(
        main, "fetch_recommendation_detail", return_value=None
    ):
        with pytest.raises(HTTPException) as error:
            asyncio.run(
                main.update_internal_recommendation_status(
                    1,
                    main.RecommendationStatusUpdateRequest(new_status="Under Review"),
                    main.User(id=2, username="staff", role="manager"),
                )
            )
    assert error.value.status_code == 404
    conn.rollback.assert_called_once()
    conn.commit.assert_not_called()


def test_dedicated_resubmit_http_route_preserves_form_contract():
    from fastapi.testclient import TestClient
    from unittest.mock import AsyncMock

    user = main.User(id=1, username="agent", role="agent")
    main.app.dependency_overrides[main.require_agent_user] = lambda: user
    try:
        with patch.object(
            main,
            "create_agent_recommendation",
            new_callable=AsyncMock,
            return_value={
                "id": 99,
                "player_name": "Jon Smith",
                "status": "Submitted",
                "agent_status": "Active",
            },
        ) as create:
            result = TestClient(main.app).post(
                "/agents/recommendations/1/resubmit",
                data={
                    "agent_name": "Agent",
                    "agent_email": "agent@example.com",
                    "submission_date": "2026-10-07",
                    "player_name": "Jon Smith",
                    "resubmission_changes": "Now available",
                },
            )
            assert result.status_code == 200, result.text
            assert create.call_args.kwargs["previous_recommendation_id"] == 1
            assert create.call_args.kwargs["resubmission_changes"] == "Now available"
            assert create.call_args.kwargs["current_user"] == user
    finally:
        main.app.dependency_overrides.pop(main.require_agent_user, None)
