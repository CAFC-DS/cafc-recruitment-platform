"""Endpoint-level check that scout report writes are atomic, on a fresh CORE clone.

Usage: python verify_report_write_atomicity.py ENV_FILE RESULT_JSON
Clones CAFC_DB.CORE into a new CORE_DEV_CODEX_TXNEP_* schema, injects failures
mid-save (hidden score table, report table swapped for a view) and drops the
clone afterwards. Reads players/matches from production APP_COMPAT (read-only).
"""
import sys, os, uuid, json
from queue import Queue
APP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, APP); sys.path.insert(0, os.path.dirname(__file__)); os.chdir(APP)
from connection import connect, isolated_schema
import main
from fastapi.testclient import TestClient

ENV, RESULT = sys.argv[1], sys.argv[2]
name = "CORE_DEV_CODEX_TXNEP_" + uuid.uuid4().hex[:6].upper(); S = isolated_schema(name)
admin = connect(ENV); ac = admin.cursor(); ac.execute(f"CREATE SCHEMA {S} CLONE CAFC_DB.CORE")
pool = Queue(maxsize=5)
def borrow():
    try: raw = pool.get_nowait()
    except Exception: raw = connect(ENV)
    return main.PooledSnowflakeConnection(raw, pool)
APPCOMPAT = {"players", "players_base", "matches"}
main.core_table = lambda t: f"{S}.{t}"
main.read_table = lambda t: (f"CAFC_DB.APP_COMPAT.{t}" if t.lower() in APPCOMPAT else f"{S}.{t}")
main.write_table = lambda t: f"{S}.{t}"
main.get_snowflake_connection = borrow
ac.execute(f"SELECT ID FROM {S}.USERS WHERE ROLE='admin' ORDER BY ID LIMIT 1"); uid = ac.fetchone()[0]
main.app.dependency_overrides[main.get_current_user] = lambda: main.User(id=uid, username="txn-test", role="admin")
main.TABLE_SCHEMA_CACHE.clear()
ac.execute("SELECT PLAYERID FROM CAFC_DB.APP_COMPAT.PLAYERS WHERE PLAYERID IS NOT NULL ORDER BY PLAYERID LIMIT 1"); pid = int(ac.fetchone()[0])
def n(sql): ac.execute(sql); return ac.fetchone()[0]
reports = lambda: n(f"select count(*) from {S}.SCOUT_REPORTS")
scores = lambda: n(f"select count(*) from {S}.SCOUT_REPORT_ATTRIBUTE_SCORES")
body = {"player_id": pid, "playerPosition": "CB", "playerBuild": "Average", "playerHeight": "Average", "assessmentSummary": "txn-test " + name,
        "reportType": "Player Assessment", "performanceScore": 6, "attributeScores": {"Heading": 7, "Passing": 6}, "strengths": ["a"], "weaknesses": ["b"]}
c = TestClient(main.app); res = {"schema": name}
try:
    r0, s0 = reports(), scores()
    ac.execute(f"ALTER TABLE {S}.SCOUT_REPORT_ATTRIBUTE_SCORES RENAME TO {S}.SRAS_HIDDEN")
    resp = c.post("/scout_reports", json=body); ac.execute(f"ALTER TABLE {S}.SRAS_HIDDEN RENAME TO {S}.SCOUT_REPORT_ATTRIBUTE_SCORES")
    res["A_create_failure_status"] = resp.status_code; res["A_no_partial_report"] = reports() == r0
    resp = c.post("/scout_reports", json=body); res["B_status"] = resp.status_code
    rid = resp.json().get("report_id"); res["B_rows"] = (reports() - r0, scores() - s0)
    ac.execute(f"ALTER TABLE {S}.SCOUT_REPORT_ATTRIBUTE_SCORES RENAME TO {S}.SRAS_HIDDEN")
    resp = c.put(f"/scout_reports/{rid}", json=dict(body, assessmentSummary="edited " + name))
    ac.execute(f"ALTER TABLE {S}.SRAS_HIDDEN RENAME TO {S}.SCOUT_REPORT_ATTRIBUTE_SCORES")
    res["C_edit_failure_status"] = resp.status_code
    res["C_summary_unchanged"] = n(f"select SUMMARY from {S}.SCOUT_REPORTS where ID={rid}") == body["assessmentSummary"]
    res["C_scores_intact"] = n(f"select count(*) from {S}.SCOUT_REPORT_ATTRIBUTE_SCORES where SCOUT_REPORT_ID={rid}") == 2
    ac.execute(f"ALTER TABLE {S}.SCOUT_REPORTS RENAME TO {S}.SR_T"); ac.execute(f"CREATE VIEW {S}.SCOUT_REPORTS AS SELECT * FROM {S}.SR_T")
    resp = c.delete(f"/scout_reports/{rid}")
    ac.execute(f"DROP VIEW {S}.SCOUT_REPORTS"); ac.execute(f"ALTER TABLE {S}.SR_T RENAME TO {S}.SCOUT_REPORTS")
    res["D_delete_failure_status"] = resp.status_code
    res["D_scores_restored"] = n(f"select count(*) from {S}.SCOUT_REPORT_ATTRIBUTE_SCORES where SCOUT_REPORT_ID={rid}") == 2
    resp = c.delete(f"/scout_reports/{rid}"); res["E_delete_status"] = resp.status_code
    res["E_gone"] = (n(f"select count(*) from {S}.SCOUT_REPORTS where ID={rid}"), n(f"select count(*) from {S}.SCOUT_REPORT_ATTRIBUTE_SCORES where SCOUT_REPORT_ID={rid}")) == (0, 0)
    res["pool_sessions_autocommit"] = []
    while not pool.empty():
        raw = pool.get_nowait(); cc = raw.cursor(); cc.execute("show parameters like 'AUTOCOMMIT' in session")
        res["pool_sessions_autocommit"].append(cc.fetchone()[1]); raw.close()
finally:
    ac.execute(f"DROP SCHEMA IF EXISTS {S}")
res["passed"] = bool(res.get("A_create_failure_status") == 500 and res.get("A_no_partial_report") and res.get("B_status") == 200 and res.get("B_rows") == (1, 2)
    and res.get("C_edit_failure_status", 0) >= 500 and res.get("C_summary_unchanged") and res.get("C_scores_intact")
    and res.get("D_delete_failure_status", 0) >= 500 and res.get("D_scores_restored") and res.get("E_delete_status") == 200 and res.get("E_gone")
    and all(v == "true" for v in res["pool_sessions_autocommit"]))
print(json.dumps(res, indent=1, default=str)); open(RESULT, "w").write(json.dumps(res, indent=1, default=str) + "\n")
