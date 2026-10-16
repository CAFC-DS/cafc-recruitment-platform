"""Exercise real ASGI routes while database calls wait, without live data."""
import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import httpx
import pytest
import main
from blocking_io import offload_read


def test_authentication_reads_do_not_block_other_requests(monkeypatch):
    entered = threading.Event()
    release = threading.Event()
    cursor = MagicMock()
    def execute(*args):
        entered.set()
        release.wait(2)
    cursor.execute.side_effect = execute
    cursor.fetchone.return_value = (7, "staff", "unused", "scout")
    connection = MagicMock()
    connection.cursor.return_value = cursor
    monkeypatch.setattr(main, "get_snowflake_connection", lambda: connection)
    monkeypatch.setattr(main, "has_column", lambda *args: False)
    monkeypatch.setattr(main, "SECRET_KEY", "test-key")
    token = main.create_access_token({"sub": "staff", "user_id": 7, "role": "admin"})

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
            task = asyncio.create_task(client.get("/users/me", headers={"Authorization": f"Bearer {token}"}))
            try:
                assert await asyncio.to_thread(entered.wait, 1)
                assert not task.done(), "Database read completed before other traffic could run"
                response = await asyncio.wait_for(client.get("/"), 0.5)
                assert response.status_code == 200
                assert not task.done()
            finally:
                release.set()
            user = await task
            # The database role wins over an old role embedded in the token.
            assert user.status_code == 200
            assert user.json()["role"] == "scout"
    asyncio.run(exercise())
    connection.close.assert_called_once()


def test_unauthenticated_read_never_opens_a_database_connection(monkeypatch):
    connection = MagicMock()
    monkeypatch.setattr(main, "get_snowflake_connection", connection)
    async def exercise():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
            assert (await client.get("/players/search?query=Smith")).status_code == 401
    asyncio.run(exercise())
    connection.assert_not_called()


def test_deleted_user_is_rejected(monkeypatch):
    monkeypatch.setattr(main, "SECRET_KEY", "test-key")
    connection = MagicMock()
    connection.cursor.return_value.fetchone.return_value = None
    monkeypatch.setattr(main, "get_snowflake_connection", lambda: connection)
    monkeypatch.setattr(main, "has_column", lambda *args: False)
    token = main.create_access_token({"sub": "deleted", "user_id": 7, "role": "admin"})
    async def exercise():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
            assert (await client.get("/users/me", headers={"Authorization": f"Bearer {token}"})).status_code == 401
    asyncio.run(exercise())


def test_read_workers_are_bounded_and_exceptions_propagate(monkeypatch):
    import blocking_io
    monkeypatch.setattr(blocking_io, "READ_CONCURRENCY", 2)
    active = 0
    maximum = 0
    lock = threading.Lock()
    def work():
        nonlocal active, maximum
        with lock:
            active += 1
            maximum = max(maximum, active)
        threading.Event().wait(0.02)
        with lock:
            active -= 1
    async def exercise():
        await asyncio.gather(*(offload_read(work)() for _ in range(6)))
        @offload_read
        def forbidden():
            raise main.HTTPException(status_code=403, detail="Not allowed")
        with pytest.raises(main.HTTPException) as error:
            await forbidden()
        assert error.value.status_code == 403
    asyncio.run(exercise())
    assert maximum == 2


def test_schema_refresh_only_probes_missing_tables(monkeypatch):
    monkeypatch.setattr(main, "TABLE_SCHEMA_CACHE", {"ready": ["ID"]})
    monkeypatch.setattr(main, "_schema_refresh_attempts", {})
    def refresh(name):
        main.TABLE_SCHEMA_CACHE[name] = ["ID"]
    probe = MagicMock(side_effect=refresh)
    monkeypatch.setattr(main, "refresh_table_schema", probe)
    with ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(main.ensure_table_schema, ["ready", "missing", "missing", "missing"]))
    probe.assert_called_once_with("missing")


def test_cache_expiry_and_invalidation_are_safe_during_concurrent_reads():
    key = "performance_test_cache"
    def writer(_):
        main.set_cache(key, {"value": 1})
        main.invalidate_cache_by_prefix(["performance_test_"])
    def reader(_):
        for i in range(100):
            value = main.get_cache(key)
            assert value is None or value == {"value": 1}
    with ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(writer, range(100)))
        list(executor.map(reader, range(10)))
    main.set_cache(key, "expired", expiry_minutes=-1)
    assert main.get_cache(key) is None


def test_competition_change_selects_its_latest_available_season():
    pairs = [{"competition": "A", "season": "2026"}, {"competition": "B", "season": "2025"}]
    assert main.select_metric_season(pairs, "B", None) == pairs[1]
    assert main.select_metric_season(pairs, "A", "2026") == pairs[0]
    assert main.select_metric_season(pairs, "unknown", None) == pairs[0]


def test_inflight_read_cannot_repopulate_invalidated_cache():
    entered = threading.Event()
    release = threading.Event()
    key = "performance_test_stale"
    @offload_read
    def old_read():
        entered.set()
        release.wait(2)
        main.set_cache(key, "old data")
    async def exercise():
        task = asyncio.create_task(old_read())
        try:
            assert await asyncio.to_thread(entered.wait, 1)
            main.invalidate_cache_by_prefix(["performance_test_"])
        finally:
            release.set()
        await task
        assert main.get_cache(key) is None
    asyncio.run(exercise())
