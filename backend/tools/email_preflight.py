"""Read-only Snowflake and email configuration checks. Never requests a Graph token or sends mail."""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--env-file",
        help="Optional secure existing backend env file; never copied or printed",
    )
    args = parser.parse_args()
    load_dotenv(args.env_file) if args.env_file else load_dotenv()
    import main
    from weekly_digest import query_sql, weekly_window, verify_recipients
    import snowflake.connector
    from graph_certificate import certificate_configured

    auth_method = os.getenv("MS_GRAPH_AUTH_METHOD") or (
        "certificate" if certificate_configured(os.environ) else "client_secret"
    )

    result = {
        "credentials_configured": all(
            os.getenv(k)
            for k in [
                "MS_GRAPH_CLIENT_ID",
                "MS_GRAPH_TENANT_ID",
            ]
        )
        and (
            bool(
                certificate_configured(os.environ)
                and os.getenv("MS_GRAPH_CERTIFICATE_PASSWORD")
            )
            if auth_method == "certificate"
            else bool(os.getenv("MS_GRAPH_CLIENT_SECRET"))
            if auth_method == "client_secret"
            else False
        ),
        "auth_method": auth_method,
        "dry_run": os.getenv("EMAIL_DRY_RUN", "true"),
        "live_enabled": os.getenv("EMAIL_LIVE_ENABLED", "false"),
        "test_recipient_configured": bool(os.getenv("EMAIL_TEST_RECIPIENT")),
        "schema": {},
        "recipient_candidates": [],
    }
    conn = main.get_snowflake_connection()
    try:
        cursor = conn.cursor()
        for table in [
            "player_recommendations",
            "email_batches",
            "email_jobs",
            "email_log",
            "lifecycle_mutex",
        ]:
            try:
                cursor.execute(f"DESCRIBE TABLE {main.core_table(table)}")
                cols = {r[0]: r[1] for r in cursor.fetchall()}
                result["schema"][table] = (
                    {
                        k: cols.get(k)
                        for k in [
                            "PREVIOUS_RECOMMENDATION_ID",
                            "RESUBMISSION_CHANGES",
                            "LINKED_UNIVERSAL_ID",
                        ]
                    }
                    if table == "player_recommendations"
                    else "present"
                )
            except Exception:
                result["schema"][table] = "missing or inaccessible"
        cursor.execute(f'DESCRIBE TABLE {main.core_table("scout_reports")}')
        result["report_column_types"] = {
            r[0]: r[1]
            for r in cursor.fetchall()
            if r[0]
            in {
                "PERFORMANCE_SCORE",
                "IS_ARCHIVED",
                "CREATED_AT",
                "REPORT_TYPE",
                "PURPOSE",
            }
        }
        cursor.execute(
            f"SELECT COUNT(*), MIN(TRY_TO_DOUBLE(TO_VARCHAR(PERFORMANCE_SCORE))), MAX(TRY_TO_DOUBLE(TO_VARCHAR(PERFORMANCE_SCORE))), MAX(CREATED_AT) FROM {main.core_table('scout_reports')}"
        )
        result["report_totals_score_range_latest"] = [
            str(v) if v is not None else None for v in cursor.fetchone()
        ]
        cursor.execute(
            f"""SELECT REPORT_TYPE, PURPOSE, TRY_TO_DOUBLE(TO_VARCHAR(PERFORMANCE_SCORE)), COUNT(*)
            FROM {main.core_table('scout_reports')}
            WHERE CREATED_AT >= DATEADD(day,-30,CURRENT_TIMESTAMP())
            GROUP BY REPORT_TYPE,PURPOSE,TRY_TO_DOUBLE(TO_VARCHAR(PERFORMANCE_SCORE))
            ORDER BY REPORT_TYPE,PURPOSE,3"""
        )
        result["report_distribution_last_30_days"] = [
            [str(v) if v is not None else None for v in r] for r in cursor.fetchall()
        ]
        for first, last in [
            ("Phil", "Chappell"),
            ("Calvin", "Charlton"),
            ("Liam", "Burden"),
        ]:
            cursor.execute(
                f'SELECT USERNAME,ROLE,EMAIL FROM {main.core_table("users")} WHERE (LOWER(TRIM(FIRSTNAME)) LIKE %s AND LOWER(TRIM(LASTNAME))=%s) OR LOWER(USERNAME) LIKE %s OR LOWER(EMAIL) LIKE %s',
                (
                    first.lower() + "%",
                    last.lower(),
                    "%" + last.lower() + "%",
                    "%" + last.lower() + "%",
                ),
            )
            result["recipient_candidates"].append(
                {
                    "name": first + " " + last,
                    "matches": [
                        {"username": r[0], "role": r[1], "email": r[2]}
                        for r in cursor.fetchall()
                    ],
                }
            )
        start, end = weekly_window()
        dc = conn.cursor(snowflake.connector.DictCursor)
        dc.execute(query_sql(main), (start, end))
        rows = dc.fetchall()
        result["current_digest"] = {
            "start_utc": str(start),
            "end_utc": str(end),
            "reports": len(rows),
            "players": len({r["UNIVERSAL_ID"] for r in rows}),
        }
        configured = os.getenv("DIGEST_RECIPIENTS", "")
        if configured:
            try:
                result["configured_digest_recipients"] = verify_recipients(
                    cursor, main, configured.split(",")
                )
            except ValueError as exc:
                result["digest_recipient_error"] = str(exc)
        print(json.dumps(result, indent=2))
    finally:
        conn.close()


if __name__ == "__main__":
    run()
