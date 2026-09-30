"""Tests for write_path: write flags fail safe to LEGACY, and transactions are explicit and atomic."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import write_path  # noqa: E402


class Cursor:
    def __init__(self, rows=None, fail_on=None):
        self.rows, self.executed, self.fail_on = rows or [], [], fail_on

    def execute(self, sql, params=None):
        self.executed.append(sql)
        if self.fail_on and self.fail_on in sql:
            raise RuntimeError("boom")

    def fetchall(self):
        return list(self.rows)


class Conn:
    def __init__(self, cursor):
        self._c, self.closed = cursor, False

    def cursor(self):
        return self._c

    def close(self):
        self.closed = True


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def make(rows=None, raises=None, ttl=5.0):
    clock, calls = Clock(), {"n": 0}

    def connect():
        calls["n"] += 1
        if raises:
            raise raises
        return Conn(Cursor(rows))

    return write_path.WriteFlags("CAFC_DB.CORE.APP_WRITE_FLAGS", connect, ttl, clock), clock, calls


def test_every_domain_defaults_to_legacy_when_the_table_is_empty():
    flags, _, _ = make(rows=[])
    assert not any(flags.enabled(d) for d in write_path.DOMAINS)


def test_flag_is_read_from_the_table():
    flags, _, _ = make(rows=[("recommendations", True), ("intel", False)])
    assert flags.enabled("recommendations") is True
    assert flags.enabled("intel") is False
    assert flags.enabled("lists") is False  # no row -> legacy


@pytest.mark.parametrize("error", [RuntimeError("no such table"), ConnectionError("down"), Exception("anything")])
def test_any_error_fails_safe_to_legacy(error):
    flags, _, _ = make(raises=error)
    assert all(flags.enabled(d) is False for d in write_path.DOMAINS)


def test_unknown_domain_is_never_enabled():
    flags, _, calls = make(rows=[("typo_domain", True)])
    assert flags.enabled("typo_domain") is False
    assert calls["n"] == 0  # rejected before touching the database


def test_value_is_cached_until_the_ttl_expires():
    flags, clock, calls = make(rows=[("reports", True)], ttl=5.0)
    assert flags.enabled("reports") and flags.enabled("reports")
    assert calls["n"] == 1
    clock.t = 4.9
    flags.enabled("reports")
    assert calls["n"] == 1
    clock.t = 5.0
    flags.enabled("reports")
    assert calls["n"] == 2


def test_a_failed_refresh_is_also_cached_so_a_broken_database_is_not_hammered():
    flags, clock, calls = make(raises=RuntimeError("down"), ttl=5.0)
    flags.enabled("users"), flags.enabled("users"), flags.enabled("users")
    assert calls["n"] == 1


def test_invalidate_forces_a_reload():
    flags, _, calls = make(rows=[("users", True)])
    flags.enabled("users")
    flags.invalidate()
    flags.enabled("users")
    assert calls["n"] == 2


def test_connection_is_always_closed():
    closed = []

    def connect():
        conn = Conn(Cursor([("users", True)]))
        closed.append(conn)
        return conn

    write_path.WriteFlags("t", connect).enabled("users")
    assert closed and closed[0].closed


def test_transaction_commits_on_success():
    cur = Cursor()
    with write_path.transaction(cur) as c:
        c.execute("INSERT 1")
        c.execute("INSERT 2")
    assert cur.executed == ["BEGIN", "INSERT 1", "INSERT 2", "COMMIT"]


def test_transaction_rolls_back_and_reraises_on_failure():
    cur = Cursor(fail_on="INSERT 2")
    with pytest.raises(RuntimeError, match="boom"):
        with write_path.transaction(cur) as c:
            c.execute("INSERT 1")
            c.execute("INSERT 2")
    assert cur.executed == ["BEGIN", "INSERT 1", "INSERT 2", "ROLLBACK"]
    assert "COMMIT" not in cur.executed


def test_transaction_reraises_the_original_error_even_if_rollback_fails():
    cur = Cursor(fail_on="ROLLBACK")

    with pytest.raises(ValueError, match="original"):
        with write_path.transaction(cur):
            raise ValueError("original")


def test_transaction_rolls_back_on_http_style_exceptions_too():
    class Http(Exception):
        pass

    cur = Cursor()
    with pytest.raises(Http):
        with write_path.transaction(cur):
            raise Http()
    assert cur.executed[-1] == "ROLLBACK"


def test_main_exposes_the_flags_and_defaults_to_legacy(monkeypatch):
    import main

    assert main.WRITE_FLAGS._table.endswith(".app_write_flags")
    flags, _, _ = make(rows=[("recommendations", True)])
    monkeypatch.setattr(main, "WRITE_FLAGS", flags)
    assert main.normalized_writes("recommendations") is True
    assert main.normalized_writes("reports") is False

    broken, _, _ = make(raises=RuntimeError("no connection"))
    monkeypatch.setattr(main, "WRITE_FLAGS", broken)
    assert main.normalized_writes("recommendations") is False  # fail safe
