"""Recruitment digest query, UK weekly windows and safe HTML rendering."""
from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
from html import escape
from urllib.parse import quote, urlparse
from zoneinfo import ZoneInfo

UK = ZoneInfo("Europe/London")


def weekly_window(now=None):
    now = (now or datetime.now(timezone.utc)).astimezone(UK)
    end = datetime.combine(now.date() - timedelta(days=now.weekday()), time(7), UK)
    if end > now:
        end -= timedelta(days=7)
    start = end - timedelta(days=7)
    return start.astimezone(timezone.utc).replace(tzinfo=None), end.astimezone(
        timezone.utc
    ).replace(tzinfo=None)


def scheduled_now(now=None):
    local = (now or datetime.now(timezone.utc)).astimezone(UK)
    return local.weekday() == 0 and local.hour == 7


def query_sql(app):
    # Keep the same internal/external compatibility join used by player report pages.
    return f"""SELECT sr.ID AS REPORT_ID, sr.CREATED_AT, p.PLAYERNAME AS PLAYER_NAME,
        p.SQUADNAME AS CLUB, sr.POSITION,
        CASE WHEN p.DATA_SOURCE='internal' THEN CONCAT('internal_',p.CAFC_PLAYER_ID)
             ELSE CONCAT('external_',p.PLAYERID) END AS UNIVERSAL_ID,
        COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.FIRSTNAME,''),' ',COALESCE(u.LASTNAME,''))),''),u.USERNAME,'Unknown scout') AS SCOUT,
        TRY_TO_DOUBLE(TO_VARCHAR(sr.PERFORMANCE_SCORE)) AS SCORE, sr.REPORT_TYPE, sr.FLAG_CATEGORY,
        LEFT(sr.SUMMARY,240) AS SUMMARY
        FROM {app.core_table('scout_reports')} sr
        JOIN {app.read_table('players')} p ON
          (sr.PLAYER_ID=p.PLAYERID AND p.DATA_SOURCE='external') OR
          (sr.CAFC_PLAYER_ID=p.CAFC_PLAYER_ID AND p.DATA_SOURCE='internal')
        LEFT JOIN {app.core_table('users')} u ON u.ID=sr.USER_ID
        WHERE sr.CREATED_AT >= %s AND sr.CREATED_AT < %s
          AND COALESCE(sr.IS_ARCHIVED,FALSE)=FALSE
          AND UPPER(TRIM(COALESCE(sr.PURPOSE,''))) <> 'LOAN REPORT'
          AND ((sr.REPORT_TYPE='Player Assessment' AND TRY_TO_DOUBLE(TO_VARCHAR(sr.PERFORMANCE_SCORE)) >= 7)
               OR (sr.REPORT_TYPE='Flag' AND sr.FLAG_CATEGORY='Positive'))
        ORDER BY p.PLAYERNAME, sr.CREATED_AT, sr.ID"""


def render_digest(rows, start, end, base):
    parsed = urlparse(base)
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
        raise ValueError("Configure FRONTEND_URL as the HTTPS platform origin")
    groups = defaultdict(list)
    for row in rows:
        if not row["UNIVERSAL_ID"]:
            raise ValueError("A qualifying report has no canonical player identity")
        groups[row["UNIVERSAL_ID"]].append(row)

    def uk_date(value):
        return (
            value.replace(tzinfo=timezone.utc)
            .astimezone(UK)
            .strftime("%d %b %Y, %H:%M")
        )

    subject = f"Recruitment weekly digest — {uk_date(end)}"
    body = f"<html><body><h2>Recruitment weekly digest</h2><p>{escape(uk_date(start))} to {escape(uk_date(end))} (UK)</p>"
    if not groups:
        body += "<p>No recruitment players received a 7+ assessment or positive flag this week.</p>"
    for key, reports in groups.items():
        row = reports[0]
        # Existing player route accepts internal_/external_ universal IDs.
        url = base.rstrip("/") + "/player/" + quote(key, safe="")
        body += f'<h3><a href="{escape(url, quote=True)}">{escape(row["PLAYER_NAME"] or "Unknown player")}</a></h3>'
        body += f'<p>{escape(row["CLUB"] or "Unknown club")} · {escape(row["POSITION"] or "Unknown position")}</p><ul>'
        for report in reports:
            rating = (
                "Positive flag"
                if report["REPORT_TYPE"] == "Flag"
                else f'Rating {report["SCORE"]:g}'
            )
            body += f'<li><strong>{escape(rating)}</strong> — {escape(report["SCOUT"] or "Unknown scout")}<br>{escape(report["SUMMARY"] or "")}</li>'
        body += "</ul>"
    return subject, body + "</body></html>", len(groups)


def verify_recipients(cursor, app, recipients):
    from email_service import valid_email

    emails = sorted({r.strip().lower() for r in recipients if r.strip()})
    if not emails or any(not valid_email(r) for r in emails):
        raise ValueError("Configure valid DIGEST_RECIPIENTS")
    for recipient in emails:
        cursor.execute(
            f'SELECT ID,ROLE FROM {app.core_table("users")} WHERE LOWER(TRIM(EMAIL))=%s',
            (recipient,),
        )
        rows = cursor.fetchall()
        if len(rows) != 1 or rows[0][1] not in {
            app.ROLE_ADMIN,
            app.ROLE_MANAGER,
            app.ROLE_SENIOR_MANAGER,
        }:
            raise ValueError(
                f"Digest recipient {recipient} must resolve uniquely to a manager, senior manager or admin"
            )
    return emails
