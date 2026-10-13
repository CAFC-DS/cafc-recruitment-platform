"""Exercise admin routes against a transactional local SQL store, without real email/Snowflake.

This validates state transitions/rollback and the API contract. Snowflake-specific
locking/privileges still require the documented staging migration checks.
"""
import sqlite3
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from email_lifecycle import register_routes, process_one
from email_service import SendResult


class Cursor:
    def __init__(self, db):
        self.inner = db.cursor()
        self.rowcount = 0

    def execute(self, sql, params=()):
        sql = sql.replace("%s", "?").replace("CURRENT_TIMESTAMP()", "CURRENT_TIMESTAMP")
        sql = sql.replace(
            "DATEADD(minute,-15,CURRENT_TIMESTAMP)", "datetime('now','-15 minutes')"
        )
        self.inner.execute(sql, params)
        self.rowcount = self.inner.rowcount
        return self

    def fetchone(self):
        return self.inner.fetchone()

    def fetchall(self):
        return self.inner.fetchall()


class Connection:
    def __init__(self, db):
        self.db = db

    def cursor(self):
        return Cursor(self.db)

    def commit(self):
        self.db.commit()

    def rollback(self):
        self.db.rollback()

    def close(self):
        pass


@pytest.fixture
def system():
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.executescript(
        """
      CREATE TABLE lifecycle_mutex (ID INTEGER, REVISION INTEGER);
      INSERT INTO lifecycle_mutex VALUES (1,0);
      CREATE TABLE users (ID INTEGER, USERNAME TEXT, ROLE TEXT, EMAIL TEXT);
      INSERT INTO users VALUES (1,'admin','admin','admin@example.com'),
        (2,'agent A','agent','shared@example.com'),(3,'agent B','agent','shared@example.com'),
        (4,'missing','agent',NULL);
      CREATE TABLE agent_profiles (USER_ID INTEGER, AGENT_EMAIL TEXT, AGENT_NAME TEXT);
      INSERT INTO agent_profiles VALUES (2,'shared@example.com','Agent A'),(3,'shared@example.com','Agent B');
      CREATE TABLE player_recommendations (ID INTEGER, PLAYER_NAME TEXT, SUBMITTED_BY_USER_ID INTEGER,
        STATUS TEXT, UPDATED_AT TEXT, CREATED_AT TEXT, AGENT_EMAIL TEXT, AGENT_NAME TEXT, STATUS_UPDATED_AT TEXT, STATUS_UPDATED_BY INTEGER);
      INSERT INTO player_recommendations VALUES
        (10,'Player A',2,'Submitted','2026-07-01','2026-07-01','old@example.com','Agent A',NULL,NULL),
        (11,'Player B',3,'Under Review','2026-07-02','2026-07-02','old@example.com','Agent B',NULL,NULL),
        (12,'Player C',2,'Added / Already in First Team Scouting Process','2026-07-03','2026-07-03','old@example.com','Agent A',NULL,NULL);
      CREATE TABLE status_history (RECOMMENDATION_ID INTEGER,OLD_STATUS TEXT,NEW_STATUS TEXT,CHANGED_BY INTEGER,CHANGED_AT TEXT);
      CREATE TABLE email_batches (ID TEXT,PURPOSE TEXT,CREATED_BY INTEGER,PAYLOAD TEXT,STATE TEXT,CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE email_jobs (ID TEXT,BATCH_ID TEXT,RECIPIENT_KEY TEXT,RECIPIENT TEXT,SUBJECT TEXT,HTML_BODY TEXT,MODE TEXT,STATUS TEXT,ERROR TEXT,UPDATED_AT TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE email_log (ID TEXT,JOB_ID TEXT,RECIPIENT TEXT,ACTUAL_RECIPIENT TEXT,PURPOSE TEXT,SUBJECT TEXT,STATUS TEXT,ERROR TEXT,SENT_AT TEXT DEFAULT CURRENT_TIMESTAMP);
    """
    )
    user = SimpleNamespace(id=1, role="admin")
    app = SimpleNamespace(
        app=FastAPI(),
        get_current_user=lambda: user,
        core_table=lambda t: t,
        ROLE_ADMIN="admin",
        VALID_ROLES=["admin", "agent", "scout"],
        get_snowflake_connection=lambda: Connection(db),
        logging=Mock(),
        os=SimpleNamespace(
            getenv=lambda key, default="": "https://platform.example.com"
            if key == "FRONTEND_URL"
            else default
        ),
    )
    register_routes(app)
    yield TestClient(app.app), db, app, user
    db.close()


def archive(client, **kwargs):
    result = client.post(
        "/admin/email/ncuc/preview", json={"recommendation_ids": [10, 11, 12], **kwargs}
    )
    assert result.status_code == 200, result.text
    return result.json()


def test_admin_only(system):
    client, db, app, user = system
    user.role = "agent"
    assert client.get("/admin/email/users").status_code == 403
    assert (
        client.post(
            "/admin/email/ncuc/preview", json={"recommendation_ids": [10]}
        ).status_code
        == 403
    )
    assert client.get("/admin/email/batches").status_code == 403


def test_manual_preview_escaped_dedup_missing_and_confirm_idempotent(system):
    client, db, app, _ = system
    preview = client.post(
        "/admin/email/preview",
        json={"role": "agent", "subject": "hello", "body": "<script>hello</script>"},
    ).json()
    assert len(preview["messages"]) == 1 and len(preview["skipped"]) == 1
    assert "&lt;script&gt;" in preview["messages"][0]["html"]
    assert db.execute("SELECT COUNT(*) FROM email_jobs").fetchone()[0] == 0
    path = f'/admin/email/batches/{preview["id"]}/confirm'
    first = client.post(path, json={"mode": "test"})
    assert first.status_code == 200
    assert client.post(path, json={"mode": "test"}).json() == first.json()
    assert db.execute("SELECT COUNT(*) FROM email_jobs").fetchone()[0] == 1
    assert client.post(path, json={"mode": "live"}).status_code == 200
    assert db.execute("SELECT COUNT(*) FROM email_jobs").fetchone()[0] == 2


def test_default_ncuc_excludes_scouting_and_writes_history_once(system):
    client, db, app, _ = system
    preview = archive(client)
    assert [r["id"] for r in preview["rows"]] == [10, 11]
    path = f'/admin/email/ncuc/{preview["id"]}/apply'
    assert client.post(path).json()["updated"] == 2
    assert client.post(path).json()["updated"] == 2
    assert db.execute("SELECT COUNT(*) FROM status_history").fetchone()[0] == 2
    assert (
        db.execute("SELECT STATUS FROM player_recommendations WHERE ID=12")
        .fetchone()[0]
        .startswith("Added")
    )
    assert db.execute("SELECT COUNT(*) FROM email_jobs").fetchone()[0] == 0


def test_explicit_process_status_included(system):
    client, *_ = system
    preview = archive(
        client, statuses=["Added / Already in First Team Scouting Process"]
    )
    assert [r["id"] for r in preview["rows"]] == [12]


def test_stale_preview_prevents_changes(system):
    client, db, app, _ = system
    preview = archive(client)
    db.execute("UPDATE player_recommendations SET UPDATED_AT='2026-10-07' WHERE ID=10")
    db.commit()
    result = client.post(f'/admin/email/ncuc/{preview["id"]}/apply')
    assert result.status_code == 409
    assert db.execute("SELECT COUNT(*) FROM status_history").fetchone()[0] == 0


def test_notification_keeps_agents_separate_and_only_changed_players(system):
    client, db, app, _ = system
    preview = archive(client)
    path = f'/admin/email/ncuc/{preview["id"]}'
    assert (
        client.post(
            path + "/notify-preview", json={"subject": "Archived", "body": "New window"}
        ).status_code
        == 400
    )
    assert client.post(path + "/apply").status_code == 200
    notification = client.post(
        path + "/notify-preview", json={"subject": "Archived", "body": "New window"}
    ).json()
    assert len(notification["messages"]) == 2
    assert (
        notification["messages"][0]["recipient"]
        == notification["messages"][1]["recipient"]
    )
    assert (
        "Player A" in notification["messages"][0]["html"]
        and "Player B" not in notification["messages"][0]["html"]
    )
    assert (
        "Player B" in notification["messages"][1]["html"]
        and "Player A" not in notification["messages"][1]["html"]
    )
    assert all("Player C" not in m["html"] for m in notification["messages"])
    path = f'/admin/email/ncuc-notifications/{notification["id"]}/confirm'
    assert client.post(path, json={"mode": "test"}).status_code == 200
    assert client.post(path, json={"mode": "test"}).status_code == 200
    assert db.execute("SELECT COUNT(*) FROM email_jobs").fetchone()[0] == 2


def test_status_transaction_rollback_on_history_failure(system):
    client, db, app, _ = system
    preview = archive(client)
    db.execute("DROP TABLE status_history")
    db.commit()
    assert client.post(f'/admin/email/ncuc/{preview["id"]}/apply').status_code == 503
    assert (
        db.execute("SELECT STATUS FROM player_recommendations WHERE ID=10").fetchone()[
            0
        ]
        == "Submitted"
    )
    assert (
        db.execute(
            "SELECT STATE FROM email_batches WHERE ID=?", (preview["id"],)
        ).fetchone()[0]
        == "preview"
    )


def test_worker_logs_and_retry_does_not_resend_accepted_or_uncertain(system):
    client, db, app, _ = system
    preview = client.post(
        "/admin/email/preview",
        json={"all_users": True, "subject": "Hello", "body": "News"},
    ).json()
    batch = client.post(
        f'/admin/email/batches/{preview["id"]}/confirm', json={"mode": "test"}
    ).json()["id"]
    transport = Mock()
    transport.send_mail.side_effect = [
        SendResult("accepted", "test@example.com"),
        SendResult("uncertain", "test@example.com", "timeout"),
    ]
    assert process_one(app, transport) is True
    assert process_one(app, transport) is True
    assert process_one(app, transport) is False
    assert db.execute("SELECT COUNT(*) FROM email_log").fetchone()[0] == 2
    detail = client.get(f"/admin/email/batches/{batch}").json()
    assert detail["state"] == "attention"
    assert client.post(f"/admin/email/batches/{batch}/retry").json()["requeued"] == 0
    db.execute("UPDATE email_jobs SET STATUS='failed' WHERE STATUS='uncertain'")
    db.commit()
    assert client.post(f"/admin/email/batches/{batch}/retry").json()["requeued"] == 1


def test_orphaned_sending_job_becomes_uncertain_without_resend(system):
    client, db, app, _ = system
    preview = client.post(
        "/admin/email/preview", json={"role": "agent", "subject": "s", "body": "b"}
    ).json()
    client.post(f'/admin/email/batches/{preview["id"]}/confirm', json={"mode": "test"})
    db.execute("UPDATE email_jobs SET STATUS='sending',UPDATED_AT='2000-01-01'")
    db.commit()
    transport = Mock()
    assert process_one(app, transport) is False
    transport.send_mail.assert_not_called()
    assert db.execute("SELECT STATUS FROM email_jobs").fetchone()[0] == "uncertain"
    assert db.execute("SELECT STATUS FROM email_log").fetchone()[0] == "uncertain"
    assert (
        db.execute("SELECT STATE FROM email_batches WHERE PURPOSE='manual'").fetchone()[
            0
        ]
        == "attention"
    )


def test_null_legacy_updated_at_can_be_archived(system):
    client, db, app, _ = system
    db.execute("UPDATE player_recommendations SET UPDATED_AT=NULL WHERE ID=10")
    db.commit()
    preview = archive(client)
    assert client.post(f'/admin/email/ncuc/{preview["id"]}/apply').status_code == 200


def test_uncertain_retry_requires_explicit_mailbox_review(system):
    client, db, app, _ = system
    preview = client.post(
        "/admin/email/preview", json={"role": "agent", "subject": "s", "body": "b"}
    ).json()
    batch = client.post(
        f'/admin/email/batches/{preview["id"]}/confirm', json={"mode": "test"}
    ).json()["id"]
    transport = Mock()
    transport.send_mail.return_value = SendResult(
        "uncertain", "test@example.com", "timeout"
    )
    process_one(app, transport)
    job = db.execute("SELECT ID FROM email_jobs").fetchone()[0]
    assert client.post(f"/admin/email/batches/{batch}/retry").json()["requeued"] == 0
    assert (
        client.post(
            f"/admin/email/jobs/{job}/review",
            json={"outcome": "not_sent", "note": "  "},
        ).status_code
        == 400
    )
    assert (
        client.post(
            f"/admin/email/jobs/{job}/review",
            json={
                "outcome": "not_sent",
                "note": "Checked recruitment Sent Items; no matching message",
            },
        ).json()["status"]
        == "failed"
    )
    assert client.post(f"/admin/email/batches/{batch}/retry").json()["requeued"] == 1
    assert db.execute("SELECT COUNT(*) FROM email_log").fetchone()[0] == 2


def test_manual_agent_address_falls_back_to_latest_recommendation(system):
    client, db, app, _ = system
    db.execute("UPDATE agent_profiles SET AGENT_EMAIL='' WHERE USER_ID=2")
    db.execute("UPDATE users SET EMAIL=NULL WHERE ID=2")
    db.execute(
        "UPDATE player_recommendations SET AGENT_EMAIL='latest@example.com' WHERE ID=12"
    )
    db.commit()
    users = client.get("/admin/email/users").json()
    assert next(u["email"] for u in users if u["id"] == 2) == "latest@example.com"


def test_delayed_notification_resolves_current_agent_contact(system):
    client, db, app, _ = system
    preview = archive(client)
    path = f'/admin/email/ncuc/{preview["id"]}'
    assert client.post(path + "/apply").status_code == 200
    db.execute(
        "UPDATE agent_profiles SET AGENT_EMAIL='new@example.com' WHERE USER_ID=2"
    )
    db.commit()
    notification = client.post(
        path + "/notify-preview", json={"subject": "Archive", "body": "Update"}
    ).json()
    assert (
        next(m["recipient"] for m in notification["messages"] if m["key"] == "2")
        == "new@example.com"
    )
