"""PooledSnowflakeConnection turns `conn.autocommit = False/True` into a real
transaction boundary and never returns an open or uncertain transaction to the pool."""
import os
import sys
from queue import Queue
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main


def _wrapped():
    real = MagicMock()
    pool = Queue(maxsize=5)
    return main.PooledSnowflakeConnection(real, pool), real, pool


def _began(real):
    return [c.args[0] for c in real.cursor.return_value.__enter__.return_value.execute.call_args_list]


def test_autocommit_false_issues_begin_once():
    conn, real, _ = _wrapped()
    conn.autocommit = False
    conn.autocommit = False
    assert _began(real) == ["BEGIN"]


def test_commit_then_autocommit_true_does_not_roll_back():
    conn, real, pool = _wrapped()
    conn.autocommit = False
    conn.commit()
    conn.autocommit = True
    conn.close()
    real.commit.assert_called_once()
    real.rollback.assert_not_called()
    assert pool.get_nowait() is real


def test_autocommit_true_without_commit_discards_the_transaction():
    conn, real, _ = _wrapped()
    conn.autocommit = False
    conn.autocommit = True
    real.rollback.assert_called_once()
    real.commit.assert_not_called()


def test_close_rolls_back_an_open_transaction_before_pooling():
    conn, real, pool = _wrapped()
    conn.autocommit = False
    conn.close()
    real.rollback.assert_called_once()
    assert pool.get_nowait() is real


def test_close_discards_connection_when_rollback_fails():
    conn, real, pool = _wrapped()
    conn.autocommit = False
    real.rollback.side_effect = RuntimeError("network")
    conn.close()
    real.close.assert_called_once()
    assert pool.empty()


def test_failed_commit_discards_session_even_after_endpoint_rollback_fails():
    conn, real, pool = _wrapped()
    conn.autocommit = False
    real.commit.side_effect = RuntimeError("commit lost")
    real.rollback.side_effect = RuntimeError("network")
    try:
        conn.commit()
    except RuntimeError:
        try:
            conn.rollback()
        except RuntimeError:
            pass
    conn.autocommit = True  # endpoint finally block must not raise
    conn.close()
    real.close.assert_called_once()
    assert pool.empty()


def test_failed_commit_alone_discards_session():
    conn, real, pool = _wrapped()
    conn.autocommit = False
    real.commit.side_effect = RuntimeError("commit lost")
    try:
        conn.commit()
    except RuntimeError:
        pass
    conn.close()
    real.close.assert_called_once()
    assert pool.empty()


def test_successful_endpoint_rollback_returns_session_to_pool():
    conn, real, pool = _wrapped()
    conn.autocommit = False
    conn.rollback()
    conn.autocommit = True
    conn.close()
    real.rollback.assert_called_once()
    assert pool.get_nowait() is real


def test_plain_session_unchanged():
    conn, real, pool = _wrapped()
    cur = conn.cursor()
    assert cur is real.cursor.return_value
    conn.close()
    real.rollback.assert_not_called()
    assert pool.get_nowait() is real


def test_other_attributes_still_settable():
    conn, _, _ = _wrapped()
    conn.custom_flag = 3
    assert conn.custom_flag == 3
