# Phase 6 Sub-Project 3: Mechanical + Join-Replication Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repoint `users`, `player_stage_history`, `player_notes`, and `player_information` off the `APP_COMPAT` bridge onto `core_table()`, closing out sub-project 3. Two of these tables are pure mechanical renames (like sub-project 2); two need a small amount of real query-shape work, since their `app_compat` views synthesize a `CAFC_PLAYER_ID` column via a join that `CORE`'s physical tables don't have.

**Architecture:** `users` and `player_stage_history` are confirmed pure passthroughs — same `read_table`/`write_table` → `core_table()` sed pattern as sub-project 2. `player_notes` and `player_information` are passthroughs too, EXCEPT at the small number of call sites that read `CAFC_PLAYER_ID` — those need the same `LEFT JOIN core_player_id_resolutions` the `app_compat` view currently does, added directly into the app's own SQL. `core_player_id_resolutions` is a dbt view materialized in `CAFC_DB.CORE` itself, so it's reachable via the existing `core_table()` helper with no new plumbing. `users` is migrated first in this plan (Task 2) specifically because it unlocks dev-clone-based login for testing the rest of this sub-project, replacing sub-project 2's prod-throwaway-account workaround.

**Tech Stack:** Python 3.10 (`/opt/anaconda3/bin/python3.10` — plain `python3` resolves to an unrelated repo's venv on this machine), FastAPI, Snowflake, pytest.

**Spec:** `docs/superpowers/specs/2026-09-18-phase6-native-core-reads-roadmap.md`

## Global Constraints

- **Scope, corrected 2026-09-26** (see roadmap commit correcting the original "medium-complexity identity-join, 4 tables individually" grouping): `users` (58 call sites: 46 read + 12 write) and `player_stage_history` (11 sites: 9 read + 2 write) are pure passthroughs — mechanical rename only, `player_stage_history`'s `CAFC_PLAYER_ID` column confirmed to have zero app consumers (verified via broad grep across `backend/main.py` and the frontend on 2026-09-26). `player_notes` (3 sites: 2 read + 1 write) and `player_information` (14 sites: 11 read + 3 write) are passthroughs except at specific call sites that read `CAFC_PLAYER_ID` directly — those need join replication, detailed per-task below.
- `CAFC_DB.CORE.PLAYER_NOTES` and `CAFC_DB.CORE.PLAYER_INFORMATION` do NOT have a `CAFC_PLAYER_ID` column (confirmed via `CAFC_DB.information_schema.columns` on 2026-09-26). The `app_compat` views add it via `LEFT JOIN core_player_id_resolutions r ON r.source_system='IMPECT' AND r.source_player_id = t.PLAYER_ID::varchar` (not all rows resolve — this is expected, matches existing behavior, never assert `NOT NULL` on the joined column).
- `core_player_id_resolutions` is a dbt view (`{{ config(materialized='view') }}`) with `+schema: CORE` in `dbt_project.yml`, so it lives at `CAFC_DB.CORE.CORE_PLAYER_ID_RESOLUTIONS` — reachable via `core_table('core_player_id_resolutions')`, exactly like any other table in this migration. No new helper needed.
- `player_information` has ~30 OTHER `has_column("player_information", "...")` call sites (lines 10841-13077, e.g. `has_current_wages_min`, `has_expected_wages_min`, `has_intel_type`, `has_relationship_to_player`) checking REAL physical columns that `CORE.PLAYER_INFORMATION` actually has. These remain valid regardless of this migration (the `app_compat` view's `pi.*` passes them through unchanged from `CORE`) and must NOT be touched by this plan. Only the ONE `CAFC_PLAYER_ID`-specific dynamic check at `main.py:17174` is in scope (Task 6).
- No runtime feature flag. Rollback is `git revert` + redeploy. `core_table()` is only equivalent to `write_table()` while `WRITE_DB` is unset (true in production today) — see the corrected note in sub-project 2's plan; the same caveat applies here for `users`' and `player_stage_history`'s write call sites.
- The `CAFC_DB.CORE_DEV_RECRUITMENT` dev clone from sub-project 2 still exists and is current enough for this work (real data confirmed present in all 4 tables via direct SQL on 2026-09-26). Local dev: `CANONICAL_DB=CAFC_DB PLATFORM_DB_SCHEMA=APP_COMPAT CORE_DB_SCHEMA=CORE_DEV_RECRUITMENT /opt/anaconda3/bin/python3.10 main.py` from `backend/`. Port 8000 may be occupied by an unrelated local app (`CharltonTracking`, per sub-project 2) — check first, use 8001 if needed.
- **Auth for testing, corrected approach vs sub-project 2**: `/token` (login) currently reads `users` via `read_table('users')` → `APP_COMPAT` (prod), which is why sub-project 2 needed a throwaway PROD account (a dev-clone-only account would have been invisible to login). Once Task 2 migrates `users` to `core_table()`, login will read via `CANONICAL_DB.CORE_DB_SCHEMA` — with `CORE_DB_SCHEMA=CORE_DEV_RECRUITMENT` set locally, a dev-clone-only account becomes usable directly. Task 1 (baseline capture, before any code changes) still needs a working login against the UNMODIFIED app, so it uses one temporary prod throwaway account, deleted immediately after that one capture. From Task 2 onward, a permanent dev-clone-only account is used instead — nothing further touches prod `USERS`.
- The pytest suite's established baseline (post sub-project 2) is 34 failed / 61 passed — unrelated, pre-existing failures. This plan's Task 8 confirms the count doesn't grow (still 34, plus this plan doesn't add new tests, so still 61 passed unless noted otherwise).
- `backend/tools/cutover_compare/creds.json` does not currently exist (cleaned up after sub-project 2) — Task 1 creates it fresh, Task 2 onward updates it to use the dev-clone account.

---

## Local Dev Setup (do this once, before Task 1)

Every "start/restart the backend" step in this plan means: run it with all three vars set, spelled out each time (a prior `export` won't persist into a fresh shell under subagent-driven execution):

```bash
cd backend
CANONICAL_DB=CAFC_DB PLATFORM_DB_SCHEMA=APP_COMPAT CORE_DB_SCHEMA=CORE_DEV_RECRUITMENT /opt/anaconda3/bin/python3.10 main.py
```

Confirm the startup log shows exactly `READ_PREFIX=CAFC_DB.APP_COMPAT  WRITE_PREFIX=CAFC_DB.CORE_DEV_RECRUITMENT`. Check port 8000 is free first (`lsof -i :8000`).

**Port note, corrected 2026-09-26 (Task 1 finding):** `main.py`'s `if __name__ == "__main__":` block hardcodes `uvicorn.run(app, host="0.0.0.0", port=8000)` — `python main.py` cannot be redirected to another port via an env var or flag. If port 8000 is taken (it was during sub-project 2 and Task 1 of this plan — an unrelated app, `CharltonTracking`), run uvicorn directly instead, bypassing the hardcoded block:
```bash
CANONICAL_DB=CAFC_DB PLATFORM_DB_SCHEMA=APP_COMPAT CORE_DB_SCHEMA=CORE_DEV_RECRUITMENT /opt/anaconda3/bin/python3.10 -m uvicorn main:app --port 8001
```
Use whichever port you actually started on consistently for that task's `curl`/`capture.py --base-url` calls.

---

## Task 1: Extend cutover_compare and capture the pre-change baseline

**Files:**
- Modify: `backend/tools/cutover_compare/capture.py`

**Interfaces:**
- Produces: 4 new `ENDPOINTS` entries; a `batch3-before` capture under `backend/tools/cutover_compare/out/` for Task 7's diff.

- [ ] **Step 1: Add endpoint entries covering this batch's tables**

Most of this batch is already covered by sub-project 2's existing `ENDPOINTS` entries, confirmed by tracing each call site to its enclosing route (2026-09-26):
- `/players/{player_id}/profile` (existing entry `"profile"`) already exercises `player_notes` (`main.py:10970`) and `player_information` (`main.py:10859`).
- `/intel_reports/all` (existing entry `"intel_all"`) already exercises `player_information` (`main.py:12912`, `12959`).
- `/player-lists/all-with-details` (existing entry `"player_lists_details"`) already exercises `player_information`'s `intel_stats_lookup` block (`main.py:17199`) and `player_stage_history` (`main.py:17013`, `17031`).

Only `player_stage_history`'s player-specific flow-history endpoint has no existing coverage. `ENDPOINTS` currently ends with the `player_lists_details` entry from sub-project 2. Add:

```python
    {"name": "player_lists_details", "path": "/player-lists/all-with-details", "query": {"category": "first_team"}},
    {"name": "player_flow_history", "path": "/players/{player_id}/flow-history", "needs_player_id": True},
    {"name": "players_all", "path": "/players/all"},
]
```

(`players_all` also gives extra coverage of `player_information`'s `main.py:12089` call site, inside `/players/all`.)

- [ ] **Step 2: Create a temporary prod throwaway login account, for this one capture only**

Generate a fresh random password — do not write real credentials into this doc; the only place a password should ever live is the gitignored `creds.json`:
```bash
/opt/anaconda3/bin/python3.10 -c "
import secrets
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
pw = secrets.token_urlsafe(24)
print('password:', pw)
print('hash:', pwd_context.hash(pw))
"
```

Take the printed hash and, from the `cafc-data-platform` repo (`/Users/hashim.umarji/Projects/cafc-data-platform`), run:

```python
import sys
sys.path.insert(0, 'python')
from _snowflake import get_connection
conn = get_connection()
cur = conn.cursor()
cur.execute(
    "INSERT INTO CAFC_DB.CORE.USERS (USERNAME, EMAIL, HASHED_PASSWORD, ROLE, FIRSTNAME, LASTNAME) VALUES (%s, %s, %s, %s, %s, %s)",
    ("phase6_sp3_baseline_admin", "phase6_sp3_baseline_admin@example.invalid", "<the hash from above>", "admin", "Phase6", "SP3Baseline"),
)
conn.commit()
cur.execute("select id, username from CAFC_DB.CORE.USERS where username = 'phase6_sp3_baseline_admin'")
print(cur.fetchall())
```

Note the returned `id` — you'll delete this exact row in Step 4.

- [ ] **Step 3: Capture the baseline**

Create `backend/tools/cutover_compare/creds.json`:
```json
{
  "admin": {"username": "phase6_sp3_baseline_admin", "password": "<CHOOSE-A-PASSWORD>"}
}
```

Start the backend per "Local Dev Setup" above. Then:
```bash
cd backend && /opt/anaconda3/bin/python3.10 tools/cutover_compare/capture.py --label batch3-before --creds-file tools/cutover_compare/creds.json
```
Confirm capture completes with no `urllib.error` failures (a role-gated 403 on an endpoint that role can't access is fine and expected — same as sub-project 2). Stop the backend afterward.

- [ ] **Step 4: Delete the temporary prod account immediately**

From the `cafc-data-platform` repo:
```python
import sys
sys.path.insert(0, 'python')
from _snowflake import get_connection
conn = get_connection()
cur = conn.cursor()
cur.execute("DELETE FROM CAFC_DB.CORE.USERS WHERE username = 'phase6_sp3_baseline_admin'")
conn.commit()
cur.execute("select count(*) from CAFC_DB.CORE.USERS where username = 'phase6_sp3_baseline_admin'")
print(cur.fetchone())  # expect (0,)
```

- [ ] **Step 5: Commit**

```bash
git add backend/tools/cutover_compare/capture.py
git commit -m "Phase 6 sub-project 3: extend cutover_compare with player_notes/player_information/player_stage_history endpoints"
```

(`creds.json` stays untracked/gitignored — do not commit it. It will be overwritten with dev-clone credentials in Task 2.)

---

## Task 2: Repoint `users` and create the dev-clone test account

**Files:**
- Modify: `backend/main.py` (58 call sites, mechanical rename — same pattern as sub-project 2's Task 4)

**Interfaces:**
- Consumes: `core_table()` from sub-project 2 (already in `backend/main.py`).
- Produces: a working dev-clone login account, used by every later task in this plan.

- [ ] **Step 1: Pre-check**

```bash
cd backend
grep -c "read_table('users')" main.py    # expect 46
grep -c "write_table('users')" main.py   # expect 12
grep -c 'read_table("users")\|write_table("users")' main.py   # expect 0
```

- [ ] **Step 2: Mechanical rename**

```bash
sed -i '' "s/read_table('users')/core_table('users')/g; s/write_table('users')/core_table('users')/g" main.py
```

- [ ] **Step 3: Verify**

```bash
grep -c "read_table('users')\|write_table('users')" main.py   # expect 0
grep -c "core_table('users')" main.py                          # expect 58
```

- [ ] **Step 4: Create the dev-clone test account**

Now that `users` reads via `core_table()`, an account inserted into `CAFC_DB.CORE_DEV_RECRUITMENT.USERS` (the dev clone, not prod) will be visible to login. From `cafc-data-platform`:

```python
import sys
sys.path.insert(0, 'python')
from _snowflake import get_connection
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
conn = get_connection()
cur = conn.cursor()
cur.execute(
    "INSERT INTO CAFC_DB.CORE_DEV_RECRUITMENT.USERS (USERNAME, EMAIL, HASHED_PASSWORD, ROLE, FIRSTNAME, LASTNAME) VALUES (%s, %s, %s, %s, %s, %s)",
    ("phase6_sp3_dev_admin", "phase6_sp3_dev_admin@example.invalid", pwd_context.hash("<CHOOSE-A-PASSWORD>"), "admin", "Phase6", "SP3Dev"),
)
conn.commit()
cur.execute("select id, username from CAFC_DB.CORE_DEV_RECRUITMENT.USERS where username = 'phase6_sp3_dev_admin'")
print(cur.fetchall())
```

Update `backend/tools/cutover_compare/creds.json` to use these credentials instead:
```json
{
  "admin": {"username": "phase6_sp3_dev_admin", "password": "<CHOOSE-A-PASSWORD>"}
}
```

- [ ] **Step 5: Manual spot-check — real login against the dev clone**

Restart the backend per "Local Dev Setup". Confirm login works and returns a token:
```bash
curl -s -X POST http://localhost:8000/token -d "username=phase6_sp3_dev_admin&password=<CHOOSE-A-PASSWORD>&grant_type=password"
```
Expected: a JSON body with `access_token`. This proves `core_table('users')` round-trips a real row end-to-end (not just an empty/error response — the lesson from sub-project 2's Task 4 review).

- [ ] **Step 6: Commit**

```bash
git add main.py
git commit -m "Phase 6 sub-project 3: repoint users to core_table()"
```

(Do not commit `creds.json` — stays untracked.)

---

## Task 3: Repoint `player_stage_history`

**Files:**
- Modify: `backend/main.py` (11 call sites, mechanical rename)

- [ ] **Step 1: Pre-check**

```bash
cd backend
grep -c "read_table('player_stage_history')" main.py    # expect 9
grep -c "write_table('player_stage_history')" main.py   # expect 2
```

- [ ] **Step 2: Mechanical rename**

```bash
sed -i '' "s/read_table('player_stage_history')/core_table('player_stage_history')/g; s/write_table('player_stage_history')/core_table('player_stage_history')/g" main.py
```

- [ ] **Step 3: Verify**

```bash
grep -c "read_table('player_stage_history')\|write_table('player_stage_history')" main.py   # expect 0
grep -c "core_table('player_stage_history')" main.py                                          # expect 11
```

- [ ] **Step 4: Manual spot-check with real data**

Real data confirmed in the dev clone: row ID 201 (PLAYER_ID 118624), ID 301 (PLAYER_ID 112069), ID 302 (PLAYER_ID 25397) all have a real `NEW_STAGE` of `'Stage 1'`. The flow-history endpoint is `GET /players/{player_id}/flow-history` (`main.py:10533`, confirmed 2026-09-26). Hit it for one of these player IDs with your dev-clone bearer token:
```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/players/118624/flow-history"
```
Expected: 200 with real stage-history entries, not an empty array — confirms `core_table('player_stage_history')` resolves correctly.

- [ ] **Step 5: Commit**

```bash
git add main.py
git commit -m "Phase 6 sub-project 3: repoint player_stage_history to core_table()"
```

---

## Task 4: Repoint `player_notes` (2 mechanical + 1 join-replication)

**Files:**
- Modify: `backend/main.py`

**Interfaces:**
- Consumes: `core_table('core_player_id_resolutions')` — reachable exactly like any other table, no new helper.

- [ ] **Step 1: Pre-check**

```bash
cd backend
grep -c "read_table('player_notes')" main.py    # expect 2
grep -c "write_table('player_notes')" main.py   # expect 1
```

- [ ] **Step 2: Mechanical rename for the 2 sites that don't reference CAFC_PLAYER_ID**

`main.py:10970` (SELECT, no `CAFC_PLAYER_ID` in its column list) and `main.py:11999` (INSERT) are pure passthroughs:

```bash
sed -i '' "s/read_table('player_notes')/core_table('player_notes')/g; s/write_table('player_notes')/core_table('player_notes')/g" main.py
```

This also renames the third site (`main.py:5694`) mechanically — that's fine, Step 3 fixes its SQL shape next; the rename itself is correct for all 3.

- [ ] **Step 3: Add the identity join to the dependency-check query**

Find the query at (what was) `main.py:5694` — a player-dependency-check `COUNT(*)` that filters on `CAFC_PLAYER_ID`:

```python
cursor.execute(
    f"SELECT COUNT(*) FROM {read_table('player_notes')} WHERE CAFC_PLAYER_ID = %s OR PLAYER_ID = %s",
    (cafc_player_id, player_id),
)
```

After Step 2's sed, `read_table` here is already `core_table`, but the query is now broken — `CAFC_DB.CORE.PLAYER_NOTES` has no `CAFC_PLAYER_ID` column. Replace it with:

```python
cursor.execute(
    f"""
    SELECT COUNT(*) FROM {core_table('player_notes')} pn
    LEFT JOIN {core_table('core_player_id_resolutions')} r
      ON r.source_system = 'IMPECT' AND r.source_player_id = pn.PLAYER_ID::varchar
    WHERE r.cafc_player_id = %s OR pn.PLAYER_ID = %s
    """,
    (cafc_player_id, player_id),
)
```

- [ ] **Step 4: Verify**

```bash
grep -c "read_table('player_notes')\|write_table('player_notes')" main.py   # expect 0
grep -n "core_table('player_notes')" main.py    # expect 3 lines, one of them inside the new JOIN query
```

- [ ] **Step 5: Manual spot-check with real data**

Real data confirmed: `player_notes` row ID 1, `PLAYER_ID` 47304, resolves to `CAFC_PLAYER_ID` 1313758 via `core_player_id_resolutions` in the dev clone. Restart the backend, then verify the notes-listing path — it's part of the aggregate `GET /players/{player_id}/profile` response (`main.py:10763`, confirmed 2026-09-26 — `player_notes` is NOT a standalone route, it's nested inside `profile`):
```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/players/47304/profile"
```
Expected: 200, valid JSON containing a notes section (may be an empty list if this specific player has no notes — that's fine; the point is the query executes without a SQL error, since Step 6 below covers the count path with real content).

The dependency-check query you edited in Step 3 lives inside `GET /admin/player-safety-check/{player_id}` (`main.py:5647`, confirmed 2026-09-26). Hit it for player 47304 with an admin/senior_manager token and confirm the `player_notes` dependency count reflects at least 1 (a real note exists for this player per row ID 1 above):
```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/admin/player-safety-check/47304"
```

- [ ] **Step 6: Commit**

```bash
git add main.py
git commit -m "Phase 6 sub-project 3: repoint player_notes to core_table(), add identity join to dependency check"
```

---

## Task 5: Repoint `player_information`'s 12 mechanical call sites

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Pre-check**

```bash
cd backend
grep -c "read_table('player_information')" main.py    # expect 11
grep -c "write_table('player_information')" main.py   # expect 3
```

- [ ] **Step 2: Mechanical rename for all sites**

```bash
sed -i '' "s/read_table('player_information')/core_table('player_information')/g; s/write_table('player_information')/core_table('player_information')/g" main.py
```

This renames all 14 sites, including the 2 that need further SQL-shape changes (Task 6 fixes those next — this task's job is just the rename; Task 6 assumes it's already done).

- [ ] **Step 3: Verify**

```bash
grep -c "read_table('player_information')\|write_table('player_information')" main.py   # expect 0
grep -c "core_table('player_information')" main.py                                        # expect 14
```

- [ ] **Step 4: Manual spot-check on sites that don't need the identity join**

`main.py:10859` (inside `GET /players/{player_id}/profile`, confirmed 2026-09-26) and `main.py:12089` (inside `GET /players/all`) don't reference `CAFC_PLAYER_ID` and need no further changes. Real data: `player_information` row ID 6536 has `PLAYER_ID` 159554. Restart the backend and check both:
```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/players/159554/profile"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/players/all?limit=5"
```
Expect 200, valid JSON, not a 500 for either (a 500 here would mean the rename broke something, since neither query has a `CAFC_PLAYER_ID` dependency to worry about yet — check the actual query params `/players/all` expects by reading its handler if `?limit=5` isn't accepted).

- [ ] **Step 5: Commit**

```bash
git add main.py
git commit -m "Phase 6 sub-project 3: repoint player_information call sites to core_table()"
```

**Note:** at this point, the app will have a temporarily-broken state for the 2 sites Task 6 fixes next (`main.py:5684` and the `~17174-17201` block) — both now reference `core_table('player_information')` but still assume a `CAFC_PLAYER_ID` column exists on it directly, which will raise a SQL error if hit. This is expected and fixed in the very next task; do not deploy/merge between Task 5 and Task 6.

---

## Task 6: Fix `player_information`'s 2 CAFC_PLAYER_ID-dependent sites

**Files:**
- Modify: `backend/main.py`

**Interfaces:**
- Consumes: `core_table('core_player_id_resolutions')`.

- [ ] **Step 1: Add the identity join to the dependency-check query**

Find the query at (what was) `main.py:5684` — same pattern as Task 4's `player_notes` fix:

```python
cursor.execute(
    f"SELECT COUNT(*) FROM {core_table('player_information')} WHERE CAFC_PLAYER_ID = %s OR PLAYER_ID = %s",
    (cafc_player_id, player_id),
)
```

Replace with:

```python
cursor.execute(
    f"""
    SELECT COUNT(*) FROM {core_table('player_information')} pi
    LEFT JOIN {core_table('core_player_id_resolutions')} r
      ON r.source_system = 'IMPECT' AND r.source_player_id = pi.PLAYER_ID::varchar
    WHERE r.cafc_player_id = %s OR pi.PLAYER_ID = %s
    """,
    (cafc_player_id, player_id),
)
```

- [ ] **Step 2: Replace the dynamic has_column-gated block with an unconditional join**

Find the block at (what was) `main.py:17174-17201` (inside the function containing `intel_stats_lookup`). It currently reads:

```python
intel_stats_lookup = {}
if all_player_ids or all_cafc_ids:
    intel_conditions = []
    intel_params = []
    has_intel_cafc_player_id = has_column("player_information", "CAFC_PLAYER_ID")

    if all_player_ids:
        external_ids = list(all_player_ids)
        placeholders = ", ".join(["%s"] * len(external_ids))
        intel_conditions.append(f"PLAYER_ID IN ({placeholders})")
        intel_params.extend(external_ids)

    if all_cafc_ids and has_intel_cafc_player_id:
        internal_ids = list(all_cafc_ids)
        placeholders = ", ".join(["%s"] * len(internal_ids))
        intel_conditions.append(f"CAFC_PLAYER_ID IN ({placeholders})")
        intel_params.extend(internal_ids)

    if intel_conditions:
        cafc_player_id_select = "CAFC_PLAYER_ID" if has_intel_cafc_player_id else "NULL as CAFC_PLAYER_ID"
        cafc_player_id_group = ", CAFC_PLAYER_ID" if has_intel_cafc_player_id else ""

        # Count intel reports from player_information table
        cursor.execute(
            f"""
            SELECT
                PLAYER_ID,
                {cafc_player_id_select},
                COUNT(*) as intel_reports_count
            FROM {core_table('player_information')}
            WHERE {" OR ".join(intel_conditions)}
            GROUP BY PLAYER_ID{cafc_player_id_group}
            """,
            intel_params,
        )

        for intel_row in cursor.fetchall():
            intel_stats_lookup[(intel_row[0], intel_row[1])] = intel_row[2] or 0
```

(Confirmed via grep on 2026-09-26 that `has_intel_cafc_player_id`, `cafc_player_id_select`, and `cafc_player_id_group` are used ONLY inside this one block — safe to remove entirely.) Replace with:

```python
intel_stats_lookup = {}
if all_player_ids or all_cafc_ids:
    intel_conditions = []
    intel_params = []

    if all_player_ids:
        external_ids = list(all_player_ids)
        placeholders = ", ".join(["%s"] * len(external_ids))
        intel_conditions.append(f"pi.PLAYER_ID IN ({placeholders})")
        intel_params.extend(external_ids)

    if all_cafc_ids:
        internal_ids = list(all_cafc_ids)
        placeholders = ", ".join(["%s"] * len(internal_ids))
        intel_conditions.append(f"r.cafc_player_id IN ({placeholders})")
        intel_params.extend(internal_ids)

    if intel_conditions:
        # Count intel reports from player_information table, joined to the
        # identity-resolution view for CAFC_PLAYER_ID (CORE.PLAYER_INFORMATION
        # has no such column of its own).
        cursor.execute(
            f"""
            SELECT
                pi.PLAYER_ID,
                r.cafc_player_id AS CAFC_PLAYER_ID,
                COUNT(*) as intel_reports_count
            FROM {core_table('player_information')} pi
            LEFT JOIN {core_table('core_player_id_resolutions')} r
              ON r.source_system = 'IMPECT' AND r.source_player_id = pi.PLAYER_ID::varchar
            WHERE {" OR ".join(intel_conditions)}
            GROUP BY pi.PLAYER_ID, r.cafc_player_id
            """,
            intel_params,
        )

        for intel_row in cursor.fetchall():
            intel_stats_lookup[(intel_row[0], intel_row[1])] = intel_row[2] or 0
```

This is a behavior-preserving simplification: `has_intel_cafc_player_id` was always effectively `True` in production already (the `app_compat` view has always had this column), so the `NULL as CAFC_PLAYER_ID` / no-`all_cafc_ids`-filtering branches were dead code paths that this migration would otherwise turn into a latent bug (the schema cache backing `has_column()` still describes `APP_COMPAT`'s shape via `read_table()`, not this query's actual `core_table()` shape).

- [ ] **Step 3: Verify no leftover references**

```bash
cd backend
grep -n "has_intel_cafc_player_id\|cafc_player_id_select\|cafc_player_id_group" main.py   # expect 0 hits
```

- [ ] **Step 4: Manual spot-check with real data**

Real data: `player_information` row ID 6536 (`PLAYER_ID` 159554) resolves to `CAFC_PLAYER_ID` 1341784 via `core_player_id_resolutions`. Restart the backend. The block you just edited lives inside `GET /player-lists/all-with-details` (`main.py:16882`, confirmed 2026-09-26). Call it with an admin/senior_manager token:
```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/player-lists/all-with-details?category=first_team"
```
If player 159554 is on the list being returned, confirm their intel-report count is present and their `CAFC_PLAYER_ID` is `1341784`, not `null` — proving the join resolved a real row end-to-end (the lesson from sub-project 2's Task 4 review: don't accept an empty/null result as sufficient). If player 159554 isn't on this particular list/category, read `main.py`'s handler to find how `all_player_ids`/`all_cafc_ids` get populated (likely from the list's member rows) and either pick a player who IS on a list, or add player 159554 to a list first via `POST /player-lists/{list_id}/players` before re-checking.

Also verify the dependency-check query from Step 1: `GET /admin/player-safety-check/159554` (same endpoint as Task 4's `player_notes` dependency check) and confirm the `intel_reports` dependency count reflects at least 1.

- [ ] **Step 5: Commit**

```bash
git add main.py
git commit -m "Phase 6 sub-project 3: add identity join to player_information's CAFC_PLAYER_ID-dependent sites"
```

---

## Task 7: Post-change capture and diff

**Files:** none modified.

- [ ] **Step 1: Capture the post-change state**

Restart the backend (all 3 env vars, per "Local Dev Setup" — use the `uvicorn` form from the Port Note if port 8000 is taken, e.g. `... -m uvicorn main:app --port 8001 &`, and adjust `capture.py --base-url` to match):
```bash
cd backend
CANONICAL_DB=CAFC_DB PLATFORM_DB_SCHEMA=APP_COMPAT CORE_DB_SCHEMA=CORE_DEV_RECRUITMENT /opt/anaconda3/bin/python3.10 main.py &
sleep 3
/opt/anaconda3/bin/python3.10 tools/cutover_compare/capture.py --label batch3-after --creds-file tools/cutover_compare/creds.json
```

Note: `creds.json` now points at the dev-clone account (`phase6_sp3_dev_admin`), not the temporary prod account Task 1 used and deleted — this is expected. The diff in Step 2 is comparing RESPONSE SHAPES, and `capture.py`'s diff normalizes/blanks request-time-volatile fields, but it does NOT account for the underlying data being different between a prod-backed capture (Task 1) and a dev-clone-backed capture (this task). Expect DIFFs on any endpoint whose content differs between prod and the dev clone's data (e.g. different player IDs having different real notes/intel/stage-history) — these are NOT regressions, they're a data-source difference. Focus verification on: (a) no endpoint that worked in Task 1 now errors, (b) no endpoint returns a different SHAPE (missing/extra fields, wrong types), rather than expecting byte-identical bodies.

- [ ] **Step 2: Diff and interpret**

```bash
/opt/anaconda3/bin/python3.10 tools/cutover_compare/diff.py --a batch3-before --b batch3-after
```

For every entry the tool reports as `DIFF`, read both JSON bodies directly (`backend/tools/cutover_compare/out/batch3-before/<role>/<endpoint>.json` vs `.../batch3-after/<role>/<endpoint>.json`) and classify: same shape, different content (expected — different DB, not a regression) vs. missing/extra field or a 500 that wasn't there before (real regression — stop and investigate before continuing). Document your classification for each DIFF in your report.

- [ ] **Step 3: No commit** — this task only verifies.

---

## Task 8: Sanity-check the pytest suite

**Files:** none modified.

- [ ] **Step 1: Run the suite**

```bash
cd backend && /opt/anaconda3/bin/python3.10 -m pytest tests/ -v 2>&1 | tail -20
```

- [ ] **Step 2: Compare against the established baseline**

Expected: 34 failed, 61 passed (same as the post-sub-project-2 baseline — this plan adds no new tests). More than 34 failed = investigate before continuing; exactly 34 = no new breakage.

- [ ] **Step 3: No commit.**

---

## Task 9: Final review and cleanup

**Files:** none modified.

- [ ] **Step 1: Confirm all 4 tables are fully migrated**

```bash
cd backend
for t in users player_stage_history player_notes player_information; do
  n=$(grep -c "read_table('$t')\|write_table('$t')" main.py)
  echo "$t: remaining=$n"   # expect 0 for every table
done
grep -n "has_intel_cafc_player_id" main.py   # expect 0 hits
```

- [ ] **Step 2: Confirm the dev-clone test account is the only credential in play**

```bash
cd /Users/hashim.umarji/Projects/cafc-data-platform
python3 -c "
import sys
sys.path.insert(0, 'python')
from _snowflake import get_connection
conn = get_connection()
cur = conn.cursor()
cur.execute(\"select count(*) from CAFC_DB.CORE.USERS where username like 'phase6_sp3%'\")
print('prod phase6_sp3 rows (expect 0):', cur.fetchone())
cur.execute(\"select count(*) from CAFC_DB.CORE_DEV_RECRUITMENT.USERS where username = 'phase6_sp3_dev_admin'\")
print('dev clone test account (expect 1):', cur.fetchone())
"
```

If the prod count isn't 0, Task 1's Step 4 cleanup didn't happen — delete it now:
```python
cur.execute("DELETE FROM CAFC_DB.CORE.USERS WHERE username LIKE 'phase6_sp3%'")
conn.commit()
```
The dev-clone account is fine to leave in place (it's isolated, harmless, and useful for the next sub-project's testing).

- [ ] **Step 3: Review the full diff**

```bash
git diff cutover/full --stat
```

Confirm the diff touches only `backend/main.py` and `backend/tools/cutover_compare/capture.py`.

- [ ] **Step 4: Push**

```bash
git push origin HEAD
```
