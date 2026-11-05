"""Endpoint-level check that report/list saves store canonical keys, on a prepared clone.

Usage: python verify_canonical_key_writes.py ENV_FILE CLONE_SCHEMA RESULT_JSON
The clone must already have the CANONICAL_* columns (canonical_report_list_keys.py
--mode add-columns). Creates synthetic report/list rows and removes the reports afterwards.
"""
import sys, os, json
from queue import Queue
APP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, APP); sys.path.insert(0, os.path.dirname(__file__)); os.chdir(APP)
from connection import connect, isolated_schema
import main
import canonical_players
from fastapi.testclient import TestClient

ENV, NAME, RESULT = sys.argv[1], sys.argv[2], sys.argv[3]
S = isolated_schema(NAME)
pool = Queue(maxsize=5)
def borrow():
    try: raw = pool.get_nowait()
    except Exception: raw = connect(ENV)
    return main.PooledSnowflakeConnection(raw, pool)
players = canonical_players.projection(S)
main.core_table = lambda t: f"{S}.{t}"
main.write_table = lambda t: f"{S}.{t}"
main.read_table = lambda t: players if t.lower() in {'players', 'players_base'} else (
    "CAFC_DB.APP_COMPAT.MATCHES" if t.lower() == 'matches' else f"{S}.{t}")
main.get_snowflake_connection = borrow
main._CORE_COLUMN_CACHE.clear()
admin = connect(ENV); ac = admin.cursor()
def one(sql, p=None): ac.execute(sql, p); return ac.fetchone()
uid = one(f"SELECT ID FROM {S}.USERS WHERE ROLE='admin' ORDER BY ID LIMIT 1")[0]
main.app.dependency_overrides[main.get_current_user] = lambda: main.User(id=uid, username="keys-test", role="admin")
ext_pid, ext_cafc = one(f"SELECT PLAYERID, CAFC_PLAYER_ID FROM {players} WHERE DATA_SOURCE='external' AND PLAYERID IS NOT NULL ORDER BY PLAYERID LIMIT 1")
ext2_pid, ext2_cafc = one(f"SELECT PLAYERID, CAFC_PLAYER_ID FROM {players} WHERE DATA_SOURCE='external' AND PLAYERID IS NOT NULL ORDER BY PLAYERID DESC LIMIT 1")
int_cafc = one(f"SELECT CAFC_PLAYER_ID FROM {players} WHERE DATA_SOURCE='internal' ORDER BY CAFC_PLAYER_ID LIMIT 1")[0]
match_ext, match_cafc = one("SELECT ID, CAFC_MATCH_ID FROM CAFC_DB.APP_COMPAT.MATCHES WHERE DATA_SOURCE='external' AND ID IS NOT NULL ORDER BY SCHEDULEDDATE DESC LIMIT 1")
ac.execute(f"SELECT ID FROM {S}.PLAYER_LISTS ORDER BY ID LIMIT 2"); lists = [r[0] for r in ac.fetchall()]
c = TestClient(main.app); res = {"schema": NAME}; made_reports = []
try:
    body = {"player_id": f"external_{ext_pid}", "selectedMatch": int(match_ext), "playerPosition": "CB", "playerBuild": "Average",
            "playerHeight": "Average", "assessmentSummary": "keys-test " + NAME, "reportType": "Player Assessment",
            "performanceScore": 6, "attributeScores": {"Heading": 7}}
    r = c.post("/scout_reports", json=body); rid = r.json().get("report_id"); made_reports.append(rid)
    res["create"] = (r.status_code, one(f"SELECT CANONICAL_PLAYER_ID, CANONICAL_FIXTURE_ID FROM {S}.SCOUT_REPORTS WHERE ID=%s", (rid,)) == (ext_cafc, match_cafc))
    edit = dict(body, player_id=f"internal_{int_cafc}", reportType="Clips", selectedMatch=None, clipCategory="Positive")
    r = c.put(f"/scout_reports/{rid}", json=edit)
    res["edit_to_internal_clip"] = (r.status_code, one(f"SELECT CANONICAL_PLAYER_ID, CANONICAL_FIXTURE_ID FROM {S}.SCOUT_REPORTS WHERE ID=%s", (rid,)) == (int_cafc, None))
    a, b = lists
    for lid in (a, b):
        ac.execute(f"DELETE FROM {S}.PLAYER_LIST_ITEMS WHERE LIST_ID=%s AND (PLAYER_ID IN (%s,%s) OR CAFC_PLAYER_ID=%s)", (lid, ext2_pid, ext_pid, int_cafc))
    r = c.post(f"/player-lists/{a}/players", json={"player_id": int(ext2_pid), "reason": "Flagged by Data"})
    key = one(f"SELECT ID, CANONICAL_PLAYER_ID FROM {S}.PLAYER_LIST_ITEMS WHERE LIST_ID=%s AND PLAYER_ID=%s", (a, ext2_pid))
    res["list_add"] = (r.status_code, key is not None and key[1] == ext2_cafc)
    r = c.post(f"/player-lists/{a}/players/{key[0]}/move", json={"destination_list_id": b})
    res["list_move"] = (r.status_code, one(f"SELECT CANONICAL_PLAYER_ID FROM {S}.PLAYER_LIST_ITEMS WHERE LIST_ID=%s AND PLAYER_ID=%s", (b, ext2_pid)) == (ext2_cafc,))
    r = c.post(f"/player-lists/{a}/players/bulk", json={"players": [{"universal_id": f"internal_{int_cafc}", "reason": "Flagged by Data"}]})
    res["list_bulk_internal"] = (r.status_code, one(f"SELECT CANONICAL_PLAYER_ID FROM {S}.PLAYER_LIST_ITEMS WHERE LIST_ID=%s AND PLAYER_ID IS NULL AND CAFC_PLAYER_ID=%s", (a, int_cafc)) == (int_cafc,))
finally:
    for rid in made_reports:
        if rid:
            ac.execute(f"DELETE FROM {S}.SCOUT_REPORT_ATTRIBUTE_SCORES WHERE SCOUT_REPORT_ID=%s", (rid,))
            ac.execute(f"DELETE FROM {S}.SCOUT_REPORTS WHERE ID=%s", (rid,))
res["passed"] = all(isinstance(v, tuple) and v[0] == 200 and v[1] for k, v in res.items() if k != "schema")
print(json.dumps(res, indent=1, default=str)); open(RESULT, "w").write(json.dumps(res, indent=1, default=str) + "\n")
