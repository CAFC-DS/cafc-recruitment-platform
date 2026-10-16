"""Verify favourite attribution survives reads, updates and removal."""
import ast
import asyncio
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException
from blocking_io import offload_read


def load_routes(connection):
    # Load the route bodies without initializing unrelated application services.
    tree = ast.parse((Path(__file__).parents[1] / "main.py").read_text())
    names = {"get_player_list_flags", "update_player_list_flag"}
    routes = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names]
    for route in routes:
        route.decorator_list = []
    namespace = {
        "User": object, "PlayerListFlagUpdate": object, "Depends": lambda fn: None,
        "get_current_user": lambda: None, "get_snowflake_connection": lambda: connection,
        "core_table": lambda name: f"CORE.{name}", "ROLE_ADMIN": "admin",
        "ROLE_SENIOR_MANAGER": "senior_manager", "HTTPException": HTTPException,
        "datetime": datetime, "List": list, "Any": object,
        "logging": MagicMock(),
    }
    exec(compile(ast.Module(body=routes, type_ignores=[]), "main.py", "exec"), namespace)
    for route in routes:
        if isinstance(route, ast.FunctionDef):
            namespace[route.name] = offload_read(namespace[route.name])
    return namespace


def test_flags_include_attribution_and_missing_history():
    connection = MagicMock()
    connection.cursor.return_value.fetchall.return_value = [
        ("1", True, False, datetime(2026, 10, 14, 12, 0), "Hashim Umarji"),
        ("2", False, True, None, None),
        ("3", True, True, None, None),
    ]
    routes = load_routes(connection)
    result = asyncio.run(routes["get_player_list_flags"](SimpleNamespace(role="admin")))
    assert result["favorites"] == ["1", "3"]
    assert result["decisions"] == ["2", "3"]
    assert result["favorite_details"] == {
        "1": {"favorited_at": "2026-10-14T12:00:00", "favorited_by": "Hashim Umarji"},
        "3": {"favorited_at": None, "favorited_by": None},
    }
    query = connection.cursor.return_value.execute.call_args.args[0]
    assert "u.FIRSTNAME" in query and "u.LASTNAME" in query
    assert "u.USERNAME" not in query
    connection.close.assert_called_once()


def check_toggle_returns_persisted_attribution(enabled):
    connection = MagicMock()
    connection.cursor.return_value.fetchone.return_value = (
        enabled, True, datetime(2026, 10, 14) if enabled else None, "Hashim Umarji" if enabled else None,
    )
    routes = load_routes(connection)
    result = asyncio.run(routes["update_player_list_flag"](
        "1", SimpleNamespace(is_favorite=enabled, is_decision=None), SimpleNamespace(role="admin", id=7),
    ))
    assert result["is_favorite"] == enabled
    assert result["is_decision"] is True
    assert result["favorite_details"] == (
        {"favorited_at": "2026-10-14T00:00:00", "favorited_by": "Hashim Umarji"} if enabled else None
    )
    connection.commit.assert_called_once()
    query = connection.cursor.return_value.execute.call_args.args[0]
    assert "u.FIRSTNAME" in query and "u.LASTNAME" in query
    assert "u.USERNAME" not in query
    connection.close.assert_called_once()


def test_toggle_add_and_remove():
    for enabled in (True, False):
        check_toggle_returns_persisted_attribution(enabled)
