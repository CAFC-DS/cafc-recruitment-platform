"""Railway cron: 0 6,7 * * 1. UK-time guard selects the BST/GMT run."""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

import snowflake.connector
from email_lifecycle import queue_messages
from lifecycle_db import acquire_mutex
from weekly_digest import (
    weekly_window,
    scheduled_now,
    query_sql,
    render_digest,
    verify_recipients,
)


def run(args):
    if args.scheduled and not scheduled_now():
        print("Outside Monday 07:00 UK; skipped")
        return
    load_dotenv(getattr(args, "env_file", None))
    import main

    start, end = weekly_window()
    if args.since:
        start = datetime.fromisoformat(args.since.replace("Z", "+00:00"))
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        start = start.astimezone(timezone.utc).replace(tzinfo=None)
    if start >= end:
        raise ValueError("--since must precede the digest window end")
    mode = args.mode or os.getenv("DIGEST_MODE", "test")
    if mode not in {"test", "live"}:
        raise ValueError("DIGEST_MODE must be test or live")
    recipients = (args.to or os.getenv("DIGEST_RECIPIENTS", "")).split(",")
    conn = main.get_snowflake_connection()
    try:
        cursor = conn.cursor()
        recipients = verify_recipients(cursor, main, recipients)
        reports_cursor = conn.cursor(snowflake.connector.DictCursor)
        reports_cursor.execute(query_sql(main), (start, end))
        rows = reports_cursor.fetchall()
        subject, html, players = render_digest(
            rows, start, end, os.getenv("FRONTEND_URL", "")
        )
        print(
            json.dumps(
                {
                    "start": str(start),
                    "end": str(end),
                    "players": players,
                    "reports": len(rows),
                    "recipients": recipients,
                    "mode": "preview" if args.dry_run else mode,
                }
            )
        )
        if args.dry_run:
            print(html)
            return
        messages = [
            {"key": recipient, "recipient": recipient, "subject": subject, "html": html}
            for recipient in recipients
        ]
        acquire_mutex(cursor, main.core_table)
        # One batch per week/mode. Recipient/content changes do not silently resend that week.
        batch_id = f"digest:{start.isoformat()}:{end.isoformat()}:{mode}"
        queue_messages(
            cursor,
            main.core_table,
            batch_id,
            "weekly_digest",
            None,
            messages,
            mode,
            {
                "start": str(start),
                "end": str(end),
                "player_count": players,
                "report_count": len(rows),
            },
        )
        conn.commit()
        print(f"Queued {batch_id}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print preview; no sends or database writes",
    )
    parser.add_argument(
        "--scheduled", action="store_true", help="Enforce Monday 07:00 Europe/London"
    )
    parser.add_argument(
        "--to", help="Comma-separated recipient addresses (must pass role verification)"
    )
    parser.add_argument("--since", help="Override UTC window start (ISO timestamp)")
    parser.add_argument("--mode", choices=["test", "live"])
    parser.add_argument("--env-file", help="Optional secure existing backend env file")
    run(parser.parse_args())
