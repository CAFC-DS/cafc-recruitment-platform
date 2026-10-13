"""Durable email batches and admin lifecycle API. All state writes use one DB mutex."""
import json
import uuid
from datetime import date, datetime, time, timedelta, timezone
from html import escape
from zoneinfo import ZoneInfo
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from email_service import valid_email
from lifecycle_db import (
    acquire_mutex,
    update_recommendation_status,
    StaleRecommendation,
)

NCUC = "Not Currently under Consideration"
DEFAULT_STATUSES = ["Submitted", "Under Review"]
PROCESS_STATUSES = [
    "Added / Already in Emerging Talent Process",
    "Added / Already in First Team Scouting Process",
]


def template(body):
    return (
        "<html><body><h2>Charlton Athletic Recruitment</h2><p>"
        + escape(body).replace("\n", "<br>")
        + "</p></body></html>"
    )


def read_batch(cursor, table, batch_id):
    cursor.execute(
        f'SELECT ID, PURPOSE, CREATED_BY, PAYLOAD, STATE, CREATED_AT FROM {table("email_batches")} WHERE ID=%s',
        (batch_id,),
    )
    row = cursor.fetchone()
    if not row:
        raise HTTPException(404, "Batch not found")
    return {
        "id": row[0],
        "purpose": row[1],
        "created_by": row[2],
        "payload": json.loads(row[3]),
        "state": row[4],
        "created_at": str(row[5]),
    }


def queue_messages(
    cursor, table, batch_id, purpose, actor, messages, mode, metadata=None
):
    """Caller holds mutex. Returns existing batch if the same identity was already queued."""
    cursor.execute(f'SELECT ID FROM {table("email_batches")} WHERE ID=%s', (batch_id,))
    if cursor.fetchone():
        return batch_id
    cursor.execute(
        f'INSERT INTO {table("email_batches")} (ID,PURPOSE,CREATED_BY,PAYLOAD,STATE) VALUES (%s,%s,%s,%s,%s)',
        (batch_id, purpose, actor, json.dumps(metadata or {}), "queued"),
    )
    for message in messages:
        cursor.execute(
            f'INSERT INTO {table("email_jobs")} '
            "(ID,BATCH_ID,RECIPIENT_KEY,RECIPIENT,SUBJECT,HTML_BODY,MODE,STATUS) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                str(uuid.uuid4()),
                batch_id,
                str(message["key"]),
                message["recipient"],
                message["subject"],
                message["html"],
                mode,
                "pending",
            ),
        )
    return batch_id


class EmailPreviewRequest(BaseModel):
    user_ids: list[int] = Field(default_factory=list, max_length=10000)
    role: str | None = None
    all_users: bool = False
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20000)


class ConfirmRequest(BaseModel):
    mode: str = "test"


class NCUCPreviewRequest(BaseModel):
    recommendation_ids: list[int] = Field(default_factory=list, max_length=10000)
    created_from: date | None = None
    created_to: date | None = None
    statuses: list[str] = Field(default_factory=lambda: DEFAULT_STATUSES.copy())


class ReviewRequest(BaseModel):
    outcome: Literal["sent", "not_sent"]
    note: str = Field(min_length=1, max_length=2000)


class NotificationRequest(ConfirmRequest):
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20000)


def ensure_mode(mode):
    if mode not in {"test", "live"}:
        raise HTTPException(400, "Choose test or live")


def ncuc_rows(cursor, app, selection):
    where, params = ["u.ROLE='agent'", "pr.STATUS <> %s"], [NCUC]
    ids = selection.get("recommendation_ids", [])
    if ids:
        where.append("pr.ID IN (" + ",".join(["%s"] * len(ids)) + ")")
        params.extend(ids)
    else:
        start, end = selection.get("created_from"), selection.get("created_to")
        if not start or not end or start > end:
            raise HTTPException(
                400, "Select recommendation IDs or a valid inclusive date range"
            )

        # UI dates are UK calendar days; Snowflake CREATED_AT is UTC NTZ.
        def utc_day(value):
            return (
                datetime.combine(
                    date.fromisoformat(value), time(), ZoneInfo("Europe/London")
                )
                .astimezone(timezone.utc)
                .replace(tzinfo=None)
            )

        where.extend(["pr.CREATED_AT >= %s", "pr.CREATED_AT < %s"])
        params.extend(
            [
                utc_day(start),
                utc_day((date.fromisoformat(end) + timedelta(days=1)).isoformat()),
            ]
        )
    statuses = selection.get("statuses", DEFAULT_STATUSES)
    if not statuses or any(
        s not in DEFAULT_STATUSES + PROCESS_STATUSES for s in statuses
    ):
        raise HTTPException(400, "Choose valid source statuses")
    where.append("pr.STATUS IN (" + ",".join(["%s"] * len(statuses)) + ")")
    params.extend(statuses)
    cursor.execute(
        f"""SELECT pr.ID, pr.PLAYER_NAME, pr.SUBMITTED_BY_USER_ID, pr.STATUS, pr.UPDATED_AT,
        COALESCE(NULLIF(TRIM(ap.AGENT_EMAIL),''), NULLIF(TRIM(u.EMAIL),''), pr.AGENT_EMAIL),
        COALESCE(ap.AGENT_NAME, pr.AGENT_NAME)
        FROM {app.core_table('player_recommendations')} pr
        JOIN {app.core_table('users')} u ON u.ID=pr.SUBMITTED_BY_USER_ID
        LEFT JOIN {app.core_table('agent_profiles')} ap ON ap.USER_ID=u.ID
        WHERE {' AND '.join(where)} ORDER BY pr.ID""",
        tuple(params),
    )
    return [
        {
            "id": int(r[0]),
            "player": r[1],
            "agent_id": int(r[2]),
            "status": r[3],
            "updated_at": str(r[4]) if r[4] is not None else None,
            "email": r[5],
            "agent_name": r[6],
        }
        for r in cursor.fetchall()
    ]


def register_routes(app):
    router = APIRouter(prefix="/admin/email", tags=["Recruitment email"])

    def admin(user=Depends(app.get_current_user)):
        if user.role != app.ROLE_ADMIN:
            raise HTTPException(403, "Admin access required")
        return user

    def transaction(work):
        conn = app.get_snowflake_connection()
        try:
            cursor = conn.cursor()
            acquire_mutex(cursor, app.core_table)
            result = work(cursor)
            conn.commit()
            return result
        except StaleRecommendation:
            conn.rollback()
            raise HTTPException(
                409, "Selection changed during apply; create a fresh preview"
            )
        except HTTPException:
            conn.rollback()
            raise
        except Exception:
            conn.rollback()
            app.logging.exception("Email lifecycle operation failed")
            raise HTTPException(
                503,
                "Email lifecycle unavailable; check migrations and database configuration",
            )
        finally:
            conn.close()

    @router.get("/users")
    def users(user=Depends(admin)):
        conn = app.get_snowflake_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                f"""SELECT u.ID, u.USERNAME, u.ROLE,
                CASE WHEN u.ROLE='agent' THEN COALESCE(NULLIF(TRIM(ap.AGENT_EMAIL),''),NULLIF(TRIM(u.EMAIL),''),legacy.AGENT_EMAIL) ELSE u.EMAIL END
                FROM {app.core_table('users')} u LEFT JOIN {app.core_table('agent_profiles')} ap ON ap.USER_ID=u.ID
                LEFT JOIN (SELECT SUBMITTED_BY_USER_ID,AGENT_EMAIL,
                    ROW_NUMBER() OVER (PARTITION BY SUBMITTED_BY_USER_ID ORDER BY CREATED_AT DESC,ID DESC) RN
                    FROM {app.core_table('player_recommendations')} WHERE NULLIF(TRIM(AGENT_EMAIL),'') IS NOT NULL) legacy
                    ON legacy.SUBMITTED_BY_USER_ID=u.ID AND legacy.RN=1
                ORDER BY u.USERNAME"""
            )
            return [
                {"id": r[0], "name": r[1], "role": r[2], "email": r[3]}
                for r in cursor.fetchall()
            ]
        finally:
            conn.close()

    @router.post("/preview")
    def preview(payload: EmailPreviewRequest, user=Depends(admin)):
        if not payload.subject.strip() or not payload.body.strip():
            raise HTTPException(400, "Subject and message are required")
        if payload.role and payload.role not in app.VALID_ROLES:
            raise HTTPException(400, "Unknown role")
        if not payload.user_ids and not payload.role and not payload.all_users:
            raise HTTPException(400, "Select recipients")
        recipients = users(user)
        chosen = [
            r
            for r in recipients
            if (
                r["id"] in payload.user_ids
                if payload.user_ids
                else (r["role"] == payload.role if payload.role else payload.all_users)
            )
        ]
        messages, skipped, seen = [], [], set()
        for r in chosen:
            if not valid_email(r["email"]):
                skipped.append(r)
                continue
            key = r["email"].strip().lower()
            if key in seen:
                continue
            seen.add(key)
            messages.append(
                {
                    "key": key,
                    "recipient": r["email"].strip(),
                    "subject": payload.subject,
                    "html": template(payload.body),
                }
            )

        def save(cursor):
            batch_id = str(uuid.uuid4())
            data = {
                "messages": messages,
                "skipped": skipped,
                "body": payload.body,
                "subject": payload.subject,
            }
            cursor.execute(
                f'INSERT INTO {app.core_table("email_batches")} (ID,PURPOSE,CREATED_BY,PAYLOAD,STATE) VALUES (%s,%s,%s,%s,%s)',
                (batch_id, "manual_preview", user.id, json.dumps(data), "preview"),
            )
            return {"id": batch_id, **data}

        return transaction(save)

    @router.post("/batches/{batch_id}/confirm")
    def confirm(batch_id: str, payload: ConfirmRequest, user=Depends(admin)):
        ensure_mode(payload.mode)

        def run(cursor):
            batch = read_batch(cursor, app.core_table, batch_id)
            if batch["purpose"] != "manual_preview":
                raise HTTPException(400, "Not a manual email preview")
            messages = batch["payload"]["messages"]
            if not messages:
                raise HTTPException(400, "No valid recipients")
            queued = queue_messages(
                cursor,
                app.core_table,
                f"{batch_id}:{payload.mode}",
                "manual",
                user.id,
                messages,
                payload.mode,
            )
            return {"id": queued}

        return transaction(run)

    @router.post("/ncuc/preview")
    def ncuc_preview(payload: NCUCPreviewRequest, user=Depends(admin)):
        def run(cursor):
            selection = json.loads(payload.model_dump_json())
            rows = ncuc_rows(cursor, app, selection)
            batch_id = str(uuid.uuid4())
            cursor.execute(
                f'INSERT INTO {app.core_table("email_batches")} (ID,PURPOSE,CREATED_BY,PAYLOAD,STATE) VALUES (%s,%s,%s,%s,%s)',
                (
                    batch_id,
                    "ncuc",
                    user.id,
                    json.dumps({"selection": selection, "rows": rows}),
                    "preview",
                ),
            )
            return {"id": batch_id, "rows": rows}

        return transaction(run)

    @router.post("/ncuc/{batch_id}/apply")
    def ncuc_apply(batch_id: str, user=Depends(admin)):
        def run(cursor):
            batch = read_batch(cursor, app.core_table, batch_id)
            if batch["purpose"] != "ncuc":
                raise HTTPException(400, "Not an NCUC batch")
            if batch["state"] == "applied":
                return {"id": batch_id, "updated": len(batch["payload"]["rows"])}
            original = batch["payload"]["rows"]
            if not original:
                raise HTTPException(400, "No recommendations selected")
            if ncuc_rows(cursor, app, batch["payload"]["selection"]) != original:
                raise HTTPException(
                    409, "Selection changed since preview; create a fresh preview"
                )
            now = datetime.utcnow()
            for row in original:
                update_recommendation_status(
                    cursor,
                    app.core_table,
                    row["id"],
                    row["status"],
                    NCUC,
                    user.id,
                    now,
                    expected_updated_at=row["updated_at"],
                )
            cursor.execute(
                f'UPDATE {app.core_table("email_batches")} SET STATE=%s WHERE ID=%s',
                ("applied", batch_id),
            )
            return {"id": batch_id, "updated": len(original)}

        return transaction(run)

    @router.post("/ncuc/{batch_id}/notify-preview")
    def notify_preview(
        batch_id: str, payload: NotificationRequest, user=Depends(admin)
    ):
        ensure_mode(payload.mode)

        def run(cursor):
            batch = read_batch(cursor, app.core_table, batch_id)
            if batch["purpose"] != "ncuc" or batch["state"] != "applied":
                raise HTTPException(
                    400, "Apply the NCUC batch before preparing notifications"
                )
            if not payload.body.strip() or not payload.subject.strip():
                raise HTTPException(400, "Supply the agreed notification wording")
            current_agents = {r["id"]: r for r in users(user) if r["role"] == "agent"}
            groups = {}
            for row in batch["payload"]["rows"]:
                groups.setdefault(row["agent_id"], []).append(row)
            messages, skipped = [], []
            base = app.os.getenv("FRONTEND_URL", "").rstrip("/")
            if not base.startswith("https://"):
                raise HTTPException(
                    503, "Configure an HTTPS FRONTEND_URL for agent links"
                )
            for agent, rows in groups.items():
                current = current_agents.get(agent)
                addresses = (
                    {current["email"].strip().lower()}
                    if current and valid_email(current["email"])
                    else set()
                )
                if len(addresses) != 1:
                    skipped.append(
                        {
                            "agent_id": agent,
                            "reason": "Missing or conflicting email addresses",
                        }
                    )
                    continue
                listing = (
                    "<ul>"
                    + "".join(
                        f'<li>{escape(r["player"] or "Unknown player")} — <a href="{escape(base, quote=True)}/agents/submissions/{r["id"]}">View submission and resubmit</a></li>'
                        for r in rows
                    )
                    + "</ul>"
                )
                messages.append(
                    {
                        "key": str(agent),
                        "recipient": next(iter(addresses)),
                        "subject": payload.subject,
                        "html": template(payload.body).replace(
                            "</body>", listing + "</body>"
                        ),
                    }
                )
            preview_id = str(uuid.uuid4())
            data = {
                "messages": messages,
                "skipped": skipped,
                "ncuc_batch_id": batch_id,
                "body": payload.body,
            }
            cursor.execute(
                f'INSERT INTO {app.core_table("email_batches")} (ID,PURPOSE,CREATED_BY,PAYLOAD,STATE) VALUES (%s,%s,%s,%s,%s)',
                (
                    preview_id,
                    "ncuc_notification_preview",
                    user.id,
                    json.dumps(data),
                    "preview",
                ),
            )
            return {"id": preview_id, **data}

        return transaction(run)

    @router.post("/ncuc-notifications/{preview_id}/confirm")
    def notify_confirm(preview_id: str, payload: ConfirmRequest, user=Depends(admin)):
        ensure_mode(payload.mode)

        def run(cursor):
            preview = read_batch(cursor, app.core_table, preview_id)
            if preview["purpose"] != "ncuc_notification_preview":
                raise HTTPException(400, "Not a notification preview")
            data = preview["payload"]
            if not data["messages"]:
                raise HTTPException(400, "No valid agent recipients")
            queued = queue_messages(
                cursor,
                app.core_table,
                f'ncuc:{data["ncuc_batch_id"]}:{payload.mode}',
                "ncuc_notification",
                user.id,
                data["messages"],
                payload.mode,
                {"preview_id": preview_id},
            )
            return {"id": queued}

        return transaction(run)

    @router.get("/batches")
    def batches(user=Depends(admin)):
        conn = app.get_snowflake_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                f'SELECT ID,PURPOSE,STATE,CREATED_AT FROM {app.core_table("email_batches")} ORDER BY CREATED_AT DESC LIMIT 100'
            )
            return [
                {"id": r[0], "purpose": r[1], "state": r[2], "created_at": str(r[3])}
                for r in cursor.fetchall()
            ]
        finally:
            conn.close()

    @router.get("/batches/{batch_id}")
    def detail(batch_id: str, user=Depends(admin)):
        conn = app.get_snowflake_connection()
        try:
            cursor = conn.cursor()
            batch = read_batch(cursor, app.core_table, batch_id)
            cursor.execute(
                f'SELECT ID,RECIPIENT,MODE,STATUS,ERROR FROM {app.core_table("email_jobs")} WHERE BATCH_ID=%s ORDER BY RECIPIENT',
                (batch_id,),
            )
            batch["jobs"] = [
                {
                    "id": r[0],
                    "recipient": r[1],
                    "mode": r[2],
                    "status": r[3],
                    "error": r[4],
                }
                for r in cursor.fetchall()
            ]
            return batch
        finally:
            conn.close()

    @router.post("/batches/{batch_id}/retry")
    def retry(batch_id: str, user=Depends(admin)):
        def run(cursor):
            read_batch(cursor, app.core_table, batch_id)
            cursor.execute(
                f'UPDATE {app.core_table("email_jobs")} SET STATUS=\'pending\', ERROR=NULL, UPDATED_AT=CURRENT_TIMESTAMP() '
                "WHERE BATCH_ID=%s AND STATUS IN ('failed','blocked')",
                (batch_id,),
            )
            count = cursor.rowcount
            if count:
                cursor.execute(
                    f'UPDATE {app.core_table("email_batches")} SET STATE=\'queued\' WHERE ID=%s',
                    (batch_id,),
                )
            return {"requeued": count}

        return transaction(run)

    @router.post("/jobs/{job_id}/review")
    def review(job_id: str, payload: ReviewRequest, user=Depends(admin)):
        if not payload.note.strip():
            raise HTTPException(
                400, "Record how you checked the mailbox before resolving this outcome"
            )

        def run(cursor):
            cursor.execute(
                f'SELECT BATCH_ID,RECIPIENT,SUBJECT,STATUS FROM {app.core_table("email_jobs")} WHERE ID=%s',
                (job_id,),
            )
            job = cursor.fetchone()
            if not job:
                raise HTTPException(404, "Email job not found")
            if job[3] != "uncertain":
                raise HTTPException(409, "Only uncertain outcomes can be reviewed")
            status = "confirmed_sent" if payload.outcome == "sent" else "failed"
            review_note = f"Reviewed by admin #{user.id}: {payload.note.strip()}"
            cursor.execute(
                f'UPDATE {app.core_table("email_jobs")} SET STATUS=%s,ERROR=%s,UPDATED_AT=CURRENT_TIMESTAMP() WHERE ID=%s',
                (status, review_note, job_id),
            )
            batch = read_batch(cursor, app.core_table, job[0])
            cursor.execute(
                f'INSERT INTO {app.core_table("email_log")} '
                "(ID,JOB_ID,RECIPIENT,PURPOSE,SUBJECT,STATUS,ERROR) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (
                    str(uuid.uuid4()),
                    job_id,
                    job[1],
                    batch["purpose"],
                    job[2],
                    status,
                    review_note,
                ),
            )
            cursor.execute(
                f'SELECT STATUS FROM {app.core_table("email_jobs")} WHERE BATCH_ID=%s',
                (job[0],),
            )
            states = [r[0] for r in cursor.fetchall()]
            state = (
                "queued"
                if any(s in {"pending", "sending"} for s in states)
                else (
                    "complete"
                    if all(s in {"accepted", "confirmed_sent"} for s in states)
                    else "attention"
                )
            )
            cursor.execute(
                f'UPDATE {app.core_table("email_batches")} SET STATE=%s WHERE ID=%s',
                (state, job[0]),
            )
            return {"status": status}

        return transaction(run)

    app.app.include_router(router)


def process_one(app, transport):
    conn = app.get_snowflake_connection()
    job = None
    try:
        cursor = conn.cursor()
        acquire_mutex(cursor, app.core_table)
        # Crashed workers may have sent successfully. Do not automatically send again.
        cursor.execute(
            f"""SELECT j.ID,j.RECIPIENT,j.SUBJECT,b.PURPOSE FROM {app.core_table('email_jobs')} j
            JOIN {app.core_table('email_batches')} b ON b.ID=j.BATCH_ID
            WHERE j.STATUS='sending' AND j.UPDATED_AT < DATEADD(minute,-15,CURRENT_TIMESTAMP())"""
        )
        for stale in cursor.fetchall():
            cursor.execute(
                f'INSERT INTO {app.core_table("email_log")} '
                "(ID,JOB_ID,RECIPIENT,PURPOSE,SUBJECT,STATUS,ERROR) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (
                    str(uuid.uuid4()),
                    stale[0],
                    stale[1],
                    stale[3],
                    stale[2],
                    "uncertain",
                    "Worker interrupted; review mailbox",
                ),
            )
        cursor.execute(
            f'UPDATE {app.core_table("email_jobs")} SET STATUS=\'uncertain\', '
            "ERROR='Worker interrupted; review mailbox', UPDATED_AT=CURRENT_TIMESTAMP() "
            "WHERE STATUS='sending' AND UPDATED_AT < DATEADD(minute,-15,CURRENT_TIMESTAMP())"
        )
        cursor.execute(
            f"UPDATE {app.core_table('email_batches')} SET STATE='attention' "
            f"WHERE STATE='queued' AND ID IN (SELECT BATCH_ID FROM {app.core_table('email_jobs')} "
            "GROUP BY BATCH_ID HAVING SUM(CASE WHEN STATUS IN ('pending','sending') THEN 1 ELSE 0 END)=0)"
        )
        cursor.execute(
            f"""SELECT j.ID,j.RECIPIENT,j.SUBJECT,j.HTML_BODY,j.MODE,j.BATCH_ID,b.PURPOSE
            FROM {app.core_table('email_jobs')} j JOIN {app.core_table('email_batches')} b ON b.ID=j.BATCH_ID
            WHERE j.STATUS='pending' ORDER BY CASE WHEN b.PURPOSE='weekly_digest' THEN 0 ELSE 1 END,j.UPDATED_AT,j.ID LIMIT 1"""
        )
        job = cursor.fetchone()
        if job:
            cursor.execute(
                f'UPDATE {app.core_table("email_jobs")} SET STATUS=\'sending\', UPDATED_AT=CURRENT_TIMESTAMP() WHERE ID=%s',
                (job[0],),
            )
        conn.commit()
        if not job:
            return False
        result = transport.send_mail(job[1], job[2], job[3], mode=job[4])
        acquire_mutex(cursor, app.core_table)
        cursor.execute(
            f'INSERT INTO {app.core_table("email_log")} '
            "(ID,JOB_ID,RECIPIENT,ACTUAL_RECIPIENT,PURPOSE,SUBJECT,STATUS,ERROR) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                str(uuid.uuid4()),
                job[0],
                job[1],
                result.actual_recipient,
                job[6],
                job[2],
                result.status,
                result.error,
            ),
        )
        cursor.execute(
            f'UPDATE {app.core_table("email_jobs")} SET STATUS=%s,ERROR=%s,UPDATED_AT=CURRENT_TIMESTAMP() WHERE ID=%s',
            (result.status, result.error, job[0]),
        )
        cursor.execute(
            f'SELECT STATUS FROM {app.core_table("email_jobs")} WHERE BATCH_ID=%s',
            (job[5],),
        )
        states = [r[0] for r in cursor.fetchall()]
        state = (
            "queued"
            if any(s in {"pending", "sending"} for s in states)
            else (
                "complete"
                if all(s in {"accepted", "confirmed_sent"} for s in states)
                else "attention"
            )
        )
        cursor.execute(
            f'UPDATE {app.core_table("email_batches")} SET STATE=%s WHERE ID=%s',
            (state, job[5]),
        )
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
