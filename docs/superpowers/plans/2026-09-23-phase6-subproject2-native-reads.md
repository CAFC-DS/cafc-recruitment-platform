# Phase 6 Sub-Project 2: Low-Complexity Batch Native CORE Reads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repoint the 13 low-complexity `app_compat` tables' reads from `CAFC_DB.APP_COMPAT` to `CAFC_DB.CORE` directly, eliminating the `APP_COMPAT` bridge for this batch entirely (reads and writes both land on `CORE` via one helper).

**Architecture:** All 13 tables are confirmed byte-for-byte passthroughs (`select * from CORE.<table>`, no column renaming) in `dbt/models/app_compat/*.sql` — this is a pure repoint, not a query rewrite. `write_table()` already resolves to `CAFC_DB.CORE` (writes have been native since the Phase 3-5 cutover); only `read_table()` still resolves to `CAFC_DB.APP_COMPAT`. Add one new helper, `core_table()`, that always resolves to `CAFC_DB.CORE.<table>`, then replace every `read_table('<table>')`/`write_table('<table>')` call site for these 13 tables with `core_table('<table>')`. This is the pattern later Phase 6 sub-projects (matches, players) will adapt once they've resolved their own shape differences.

**Tech Stack:** Python 3.10 (`/opt/anaconda3/bin/python3.10` — the system `python3` on PATH resolves to the unrelated `cafc-data-platform` repo's venv; do not use plain `python3` from this repo), FastAPI, Snowflake, pytest.

**Spec:** `docs/superpowers/specs/2026-09-18-phase6-native-core-reads-roadmap.md`

## Global Constraints

- All 13 tables in scope are pure passthroughs — confirmed by reading every `dbt/models/app_compat/<table>.sql` file in the `cafc-data-platform` repo on 2026-09-23. No column-name changes are needed anywhere in `main.py`.
- `write_table()` already resolves to `CAFC_DB.CORE` in the deployed production state (`WRITE_DB` unset → defaults to `CANONICAL_DB=CAFC_DB`, `CORE_DB_SCHEMA=CORE`). Do not change write behavior — only rename write call sites to `core_table()` for consistency (marks the table as fully migrated off the `read_table`/`write_table` seam).
- No runtime feature flag. Rollback is `git revert` + redeploy, per the roadmap.
- There is no separate dev/staging Snowflake target — local dev points at the same production `CAFC_DB` account via gitignored `backend/.env`. Verification for this batch is safe because every change here is read-path only (writes are untouched); do not add or modify any write-path code in this plan.
- The existing pytest suite (`backend/tests/`) has 34 pre-existing failures out of 92 tests as of 2026-09-23, verified against unmodified `main`, unrelated to this work (a pattern-matching bug: tests assert on bare table names in executed SQL, but `read_table()`/`write_table()` always prepend `{DB}.{SCHEMA}.`). This is **not** a reliable regression gate for this plan. Task 10 runs the suite only as a sanity check that no *new* failures appear (34 exactly, not 35+) — it is not treated as proof of correctness. Fixing the pre-existing failures is explicitly out of scope (separate follow-up, per user decision 2026-09-23).
- Two dynamic-table-name call sites are intentionally left untouched by this plan (documented in Task 4's notes) — they are already correct and only need to change in sub-project 6 (drop `APP_COMPAT`).

---

## Task 1: Add the `core_table()` helper

**Files:**
- Modify: `backend/main.py:598-602` (immediately after the existing `write_table()` definition)
- Test: `backend/tests/test_core_table_helper.py` (new)

**Interfaces:**
- Produces: `core_table(table_name: str) -> str`, used by every later task in this plan.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_core_table_helper.py`:

```python
"""
Tests for core_table() (Phase 6 sub-project 2): the helper that resolves a
table name to its fully-qualified CAFC_DB.CORE address, used once a table's
reads (not just writes) are cut over off the APP_COMPAT bridge.
"""
import main


def test_core_table_resolves_to_canonical_db_and_core_schema():
    assert main.core_table("scout_reports") == f"{main.CANONICAL_DB}.{main.CORE_DB_SCHEMA}.scout_reports"


def test_core_table_matches_write_table_in_the_deployed_full_cutover_state():
    # In production today, WRITE_DB is unset (defaults to CANONICAL_DB) and
    # CORE_DB_SCHEMA=CORE, so write_table() already resolves to CAFC_DB.CORE.
    # core_table() must resolve identically for any table name — it exists to
    # mark "this table's reads now go where its writes already do", not to
    # introduce a second address.
    assert main.core_table("scout_reports") == main.write_table("scout_reports")
    assert main.core_table("player_lists") == main.write_table("player_lists")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && /opt/anaconda3/bin/python3.10 -m pytest tests/test_core_table_helper.py -v`
Expected: `FAIL` — `AttributeError: module 'main' has no attribute 'core_table'`

- [ ] **Step 3: Add the helper**

In `backend/main.py`, immediately after the `write_table()` function (currently ends at line 602 with `return f"{WRITE_PREFIX}.{table_name}"`), add:

```python

def core_table(table_name: str) -> str:
    """Fully-qualified CAFC_DB.CORE address for `table_name`. Use once a
    table's READS (not just its writes) have been cut over off the
    APP_COMPAT bridge — Phase 6. Always resolves the same as write_table()
    resolves today (writes have been native since the Phase 3-5 cutover);
    this helper exists so a grep for read_table('<table>')/write_table('<table>')
    returning zero hits is a reliable signal that a table is fully migrated."""
    return f"{CANONICAL_DB}.{CORE_DB_SCHEMA}.{table_name}"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && /opt/anaconda3/bin/python3.10 -m pytest tests/test_core_table_helper.py -v`
Expected: `PASS` (2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_core_table_helper.py
git commit -m "Phase 6 sub-project 2: add core_table() helper"
```

---

## Task 2: Extend `cutover_compare` with this batch's endpoints

**Files:**
- Modify: `backend/tools/cutover_compare/capture.py:42-50`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: 4 new entries in `ENDPOINTS`, used by Task 3 (baseline capture) and Task 9 (post-change capture + diff).

- [ ] **Step 1: Add the new endpoint entries**

In `backend/tools/cutover_compare/capture.py`, the `ENDPOINTS` list currently ends with:

```python
    {"name": "internal_recs", "path": "/internal/recommendations"},
]
```

Change it to:

```python
    {"name": "internal_recs", "path": "/internal/recommendations"},
    {"name": "scout_reports_all", "path": "/scout_reports/all", "query": {"page": 1, "limit": 20}},
    {"name": "scout_reports_recent", "path": "/scout_reports/recent", "query": {"limit": 20}},
    {"name": "player_lists_all", "path": "/player-lists", "query": {"category": "first_team"}},
    {"name": "player_lists_details", "path": "/player-lists/all-with-details", "query": {"category": "first_team"}},
]
```

Note: `player_lists_all` requires an admin or senior-manager role (`get_all_player_lists` checks `current_user.role not in [ROLE_ADMIN, ROLE_SENIOR_MANAGER]`) — this is already handled by `cutover_compare`'s multi-role `creds.json` pattern; that role's capture will show a 403 for other roles, which is expected and unchanged before/after this plan's tasks.

The remaining 9 tables in scope for this sub-project (`scout_report_attribute_scores`, `scout_report_views`, `player_list_flags`, `shared_report_links`, `agent_profiles`, `recommendation_notes_history`, `status_history`, `password_reset_tokens`, `position_attributes`) are not added to `ENDPOINTS` — they're either nested inside the endpoints already covered above (attribute scores/views appear inside `/scout_reports/{id}` responses) or low-traffic/side-effecting enough (password reset, shares) that automated capture doesn't add value over the manual spot-check each task below already does. This is a deliberate scope decision, not an oversight.

- [ ] **Step 2: Commit**

```bash
git add backend/tools/cutover_compare/capture.py
git commit -m "Phase 6 sub-project 2: extend cutover_compare with scout_reports/player-lists endpoints"
```

---

## Task 3: Capture the pre-change baseline

**Files:** none modified — this task only runs commands.

**Interfaces:**
- Consumes: the extended `ENDPOINTS` list from Task 2.
- Produces: a `batch2-before` capture file under `backend/tools/cutover_compare/` (gitignored, per its existing `.gitignore`), read by Task 9.

Nothing in Tasks 1-2 changed any table's read/write behavior (`core_table()` exists but is unused; `capture.py` only gained new entries), so this capture reflects current production behavior — reads still via `APP_COMPAT`.

- [ ] **Step 1: Start the backend locally**

```bash
cd backend && /opt/anaconda3/bin/python3.10 main.py
```
Confirm the startup log shows `READ_PREFIX=CAFC_DB.APP_COMPAT  WRITE_PREFIX=CAFC_DB.CORE` (today's production default — no env vars needed locally since `backend/.env` already points at the same account).

- [ ] **Step 2: Capture the baseline**

In a second terminal:
```bash
cd backend && /opt/anaconda3/bin/python3.10 tools/cutover_compare/capture.py --label batch2-before --creds-file tools/cutover_compare/creds.json
```
Expected: capture completes for every role with no `urllib.error` failures. If `creds.json` doesn't exist yet, copy `tools/cutover_compare/creds.example.json` and fill in real credentials for at least one admin/senior-manager user and one scout (needed for the role-gated `player_lists_all` check in Task 2).

- [ ] **Step 3: Stop the local backend** (Ctrl+C in the first terminal) — no commit, this task produces no repo changes.

---

## Task 4: Repoint `scout_reports` (103 reads + 9 writes)

**Files:**
- Modify: `backend/main.py` (112 call sites, mechanical rename only — see step 1)

**Interfaces:**
- Consumes: `core_table()` from Task 1.

- [ ] **Step 1: Pre-check for non-standard call patterns**

```bash
cd backend && grep -c "read_table('scout_reports')" main.py   # expect 103
grep -c "write_table('scout_reports')" main.py                 # expect 9
grep -c 'read_table("scout_reports")\|write_table("scout_reports")' main.py   # expect 0 (double-quote variant)
```
If the double-quote check returns nonzero, stop and inspect those lines manually before proceeding — the sed in Step 2 only matches single-quoted calls.

- [ ] **Step 2: Mechanical rename**

```bash
sed -i '' "s/read_table('scout_reports')/core_table('scout_reports')/g; s/write_table('scout_reports')/core_table('scout_reports')/g" main.py
```

- [ ] **Step 3: Verify the rename is complete**

```bash
grep -c "read_table('scout_reports')\|write_table('scout_reports')" main.py   # expect 0
grep -c "core_table('scout_reports')" main.py                                  # expect 112
```

- [ ] **Step 4: Manual spot-check against the running app**

Restart the local backend (Ctrl+C, then `/opt/anaconda3/bin/python3.10 main.py` again) so the code change takes effect. With a valid bearer token (from `/token`, same credentials as `creds.json`):

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/scout_reports/all?page=1&limit=5" | head -c 500
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/scout_reports/recent?limit=5" | head -c 500
```

Expected: valid JSON with real scout report rows, no 500 errors. Compare row shape/count by eye against the Task 3 baseline capture files at `backend/tools/cutover_compare/out/batch2-before/<role>/scout_reports_all.json` and `.../scout_reports_recent.json` (default `--out` is `tools/cutover_compare/out`, with `<label>/<role>/<endpoint>.json` structure).

- [ ] **Step 5: Commit**

```bash
git add main.py
git commit -m "Phase 6 sub-project 2: repoint scout_reports to core_table()"
```

**Note on dynamic-table-name call sites (no action needed, documented for the record):** two places in `main.py` call `read_table(table_name)`/`write_table(table_name)` with a variable, not a literal `'scout_reports'`:
- Lines ~290, ~328 (`refresh_table_schema`/startup schema cache): loops over a fixed list including `scout_reports`, calling `read_table(table_name)` for `DESCRIBE TABLE`. Safe to leave — `APP_COMPAT.scout_reports` and `CORE.SCOUT_REPORTS` have identical columns (pure passthrough), so `DESCRIBE TABLE` returns the same result either way. This only needs to change in sub-project 6, when `APP_COMPAT` is dropped and the view stops existing.
- Line ~5826 (player-merge reassignment): loops over `("scout_reports", "player_information", "player_notes")` calling `write_table(table_name)`. No change needed — `write_table()` already resolves to `CAFC_DB.CORE` for every table.

---

## Task 5: Repoint `player_lists` + `player_list_items` (20+10, 27+15 call sites)

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Pre-check**

```bash
cd backend
grep -c "read_table('player_lists')" main.py    # expect 20
grep -c "write_table('player_lists')" main.py   # expect 10
grep -c "read_table('player_list_items')" main.py   # expect 27
grep -c "write_table('player_list_items')" main.py  # expect 15
grep -c 'read_table("player_lists")\|write_table("player_lists")\|read_table("player_list_items")\|write_table("player_list_items")' main.py   # expect 0
```

- [ ] **Step 2: Mechanical rename**

```bash
sed -i '' "s/read_table('player_lists')/core_table('player_lists')/g; s/write_table('player_lists')/core_table('player_lists')/g" main.py
sed -i '' "s/read_table('player_list_items')/core_table('player_list_items')/g; s/write_table('player_list_items')/core_table('player_list_items')/g" main.py
```

- [ ] **Step 3: Verify**

```bash
grep -c "read_table('player_lists')\|write_table('player_lists')\|read_table('player_list_items')\|write_table('player_list_items')" main.py   # expect 0
```

- [ ] **Step 4: Manual spot-check**

Restart the backend. With a bearer token for an admin/senior-manager user:

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/player-lists?category=first_team" | head -c 500
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/player-lists/all-with-details?category=first_team" | head -c 500
```

Expected: valid JSON, shortlist data present, matches the Task 3 baseline by eye.

- [ ] **Step 5: Commit**

```bash
git add main.py
git commit -m "Phase 6 sub-project 2: repoint player_lists + player_list_items to core_table()"
```

---

## Task 6: Repoint `scout_report_attribute_scores` + `scout_report_views` (9+5, 4+2 call sites)

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Pre-check**

```bash
cd backend
grep -c "read_table('scout_report_attribute_scores')" main.py   # expect 9
grep -c "write_table('scout_report_attribute_scores')" main.py  # expect 5
grep -c "read_table('scout_report_views')" main.py   # expect 4
grep -c "write_table('scout_report_views')" main.py  # expect 2
```

- [ ] **Step 2: Mechanical rename**

```bash
sed -i '' "s/read_table('scout_report_attribute_scores')/core_table('scout_report_attribute_scores')/g; s/write_table('scout_report_attribute_scores')/core_table('scout_report_attribute_scores')/g" main.py
sed -i '' "s/read_table('scout_report_views')/core_table('scout_report_views')/g; s/write_table('scout_report_views')/core_table('scout_report_views')/g" main.py
```

- [ ] **Step 3: Verify**

```bash
grep -c "read_table('scout_report_attribute_scores')\|write_table('scout_report_attribute_scores')\|read_table('scout_report_views')\|write_table('scout_report_views')" main.py   # expect 0
```

- [ ] **Step 4: Manual spot-check**

Restart the backend. Attribute scores and view receipts are nested inside a single scout report's detail response — fetch a real report id from the `/scout_reports/all` response captured in Task 4, then:

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/scout_reports/{report_id}" | head -c 800
```

Expected: response includes attribute-score fields, no 500 error. Also exercise the write path once manually via the app UI (mark a report as viewed) to confirm `MERGE INTO {core_table('scout_report_views')}` still executes without a SQL error — writes were already pointed at `CORE`, so this should be a no-op behaviorally, but the `MERGE INTO` syntax is worth a real execution check since it's less common than a plain `INSERT`/`UPDATE`.

- [ ] **Step 5: Commit**

```bash
git add main.py
git commit -m "Phase 6 sub-project 2: repoint scout_report_attribute_scores + scout_report_views to core_table()"
```

---

## Task 7: Repoint the agent/recommendation workflow group

Tables: `player_recommendations` (5+8), `agent_profiles` (2+1), `recommendation_notes_history` (1+2), `status_history` (1+2), `password_reset_tokens` (1+3).

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Pre-check**

```bash
cd backend
for t in player_recommendations agent_profiles recommendation_notes_history status_history password_reset_tokens; do
  echo "$t: read=$(grep -c "read_table('$t')" main.py) write=$(grep -c "write_table('$t')" main.py)"
done
```
Expected: `player_recommendations: read=5 write=8`, `agent_profiles: read=2 write=1`, `recommendation_notes_history: read=1 write=2`, `status_history: read=1 write=2`, `password_reset_tokens: read=1 write=3`.

- [ ] **Step 2: Mechanical rename**

```bash
for t in player_recommendations agent_profiles recommendation_notes_history status_history password_reset_tokens; do
  sed -i '' "s/read_table('$t')/core_table('$t')/g; s/write_table('$t')/core_table('$t')/g" main.py
done
```

- [ ] **Step 3: Verify**

```bash
for t in player_recommendations agent_profiles recommendation_notes_history status_history password_reset_tokens; do
  n=$(grep -c "read_table('$t')\|write_table('$t')" main.py)
  echo "$t: remaining=$n"   # expect 0 for every table
done
```

- [ ] **Step 4: Manual spot-check**

Restart the backend.

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/agents/recommendations" | head -c 500
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/internal/recommendations" | head -c 500
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/internal/recommendations/filters/meta" | head -c 500
```

Expected: valid JSON, matches Task 3 baseline by eye. `recommendation_notes_history`, `status_history`, and `password_reset_tokens` have no standalone GET routes (internal to the recommendation/password-reset workflows above) — their read paths are exercised as part of these same requests.

- [ ] **Step 5: Commit**

```bash
git add main.py
git commit -m "Phase 6 sub-project 2: repoint agent/recommendation workflow tables to core_table()"
```

---

## Task 8: Repoint the remaining reference tables

Tables: `player_list_flags` (3+4), `shared_report_links` (3+3), `position_attributes` (4+0).

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Pre-check**

```bash
cd backend
for t in player_list_flags shared_report_links position_attributes; do
  echo "$t: read=$(grep -c "read_table('$t')" main.py) write=$(grep -c "write_table('$t')" main.py)"
done
```
Expected: `player_list_flags: read=3 write=4`, `shared_report_links: read=3 write=3`, `position_attributes: read=4 write=0`.

- [ ] **Step 2: Mechanical rename**

```bash
for t in player_list_flags shared_report_links position_attributes; do
  sed -i '' "s/read_table('$t')/core_table('$t')/g; s/write_table('$t')/core_table('$t')/g" main.py
done
```

- [ ] **Step 3: Verify**

```bash
for t in player_list_flags shared_report_links position_attributes; do
  n=$(grep -c "read_table('$t')\|write_table('$t')" main.py)
  echo "$t: remaining=$n"   # expect 0 for every table
done
```

- [ ] **Step 4: Manual spot-check**

Restart the backend.

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/player-lists/flags" | head -c 500
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/attributes/CB" | head -c 500
```

Expected: valid JSON, no 500 errors. `shared_report_links` is exercised via `/public/report/{token}` — this needs a real, currently-valid share token (create one via `/scout_reports/{report_id}/share` in the running app, or via the UI, then hit `/public/report/{token}` with it) rather than a synthetic value.

- [ ] **Step 5: Commit**

```bash
git add main.py
git commit -m "Phase 6 sub-project 2: repoint player_list_flags + shared_report_links + position_attributes to core_table()"
```

---

## Task 9: Post-change capture and diff

**Files:** none modified.

**Interfaces:**
- Consumes: the `batch2-before` capture from Task 3, the fully-repointed `main.py` from Tasks 4-8.

- [ ] **Step 1: Capture the post-change state**

Restart the backend (should already be running the final code from Task 8; restart to be sure).

```bash
cd backend && /opt/anaconda3/bin/python3.10 tools/cutover_compare/capture.py --label batch2-after --creds-file tools/cutover_compare/creds.json
```

- [ ] **Step 2: Diff**

```bash
cd backend && /opt/anaconda3/bin/python3.10 tools/cutover_compare/diff.py --a batch2-before --b batch2-after
```

Expected: `OK` for every role/endpoint combination (exit 0). Any `DIFF`/`STATUS`/`MISSING` output means a real regression introduced by one of Tasks 4-8 — stop and investigate before continuing; do not proceed to Task 10 or open a PR with an unexplained diff.

- [ ] **Step 3: No commit** — this task only verifies; nothing in the repo changes.

---

## Task 10: Sanity-check the pytest suite

**Files:** none modified.

- [ ] **Step 1: Run the full suite**

```bash
cd backend && /opt/anaconda3/bin/python3.10 -m pytest tests/ -v 2>&1 | tail -20
```

- [ ] **Step 2: Compare failure count**

Expected: 34 failed, 60 passed (58 pre-existing passes + the 2 new `test_core_table_helper.py` tests from Task 1). If the failure count is higher than 34, one of Tasks 4-8's renames broke something the pre-existing suite does happen to cover correctly — investigate before proceeding. If it's exactly 34 failed, the new failures are the same pre-existing ones (unrelated to this work, per Global Constraints) and this batch introduced no new breakage by this measure.

- [ ] **Step 3: No commit** — this task only verifies.

---

## Task 11: Final review and PR

**Files:** none modified — this task wraps up the sub-project.

- [ ] **Step 1: Confirm the batch is fully migrated**

```bash
cd backend
for t in scout_reports player_lists player_list_items player_recommendations scout_report_attribute_scores scout_report_views player_list_flags shared_report_links agent_profiles recommendation_notes_history status_history password_reset_tokens position_attributes; do
  n=$(grep -c "read_table('$t')\|write_table('$t')" main.py)
  echo "$t: remaining read_table/write_table refs=$n"   # expect 0 for every table
done
```

- [ ] **Step 2: Review the full diff**

```bash
git log --oneline main..HEAD
git diff main --stat
```

Confirm the diff touches only `backend/main.py`, `backend/tests/test_core_table_helper.py`, and `backend/tools/cutover_compare/capture.py` — no unrelated changes.

- [ ] **Step 3: Push and open a PR**

```bash
git push origin HEAD
```

Per the roadmap: this is a single-developer repo with real production users, no formal review/handoff ceremony required — merge to `main` once Task 9's diff and Task 10's failure count both check out, using your normal deploy process.
