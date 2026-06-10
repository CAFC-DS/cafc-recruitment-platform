# Backend refactor backlog

Smells logged during the canonical cutover, deliberately NOT fixed mid-migration
(the cutover's safety case is byte-identical no-op verification — refactors
would destroy it). The natural moment to work this list is the **end-state
refactor**, when the app drops `APP_COMPAT` and reads `CORE` natively: the data
layer gets rewritten then anyway, and the cutover_compare harness exists as the
safety net.

Rule for adding here instead of fixing now: *does the cutover fail without the
fix?* No → log it, move on.

## Structural

- [ ] `backend/main.py` is ~16,500 lines — split into FastAPI routers per
      feature (auth, search/profile, scout reports, lists, intel, analytics,
      recommendations, admin), a `db.py` (connection pool + seam), `models.py`.
- [ ] SQL is built inline at every call site (~345 `cursor.execute`s). At
      end-state, collapse repeated query shapes (profile/report/list selects
      appear in near-identical variants several times each).
- [ ] Dual-ID machinery (`universal_id`, `DATA_SOURCE` branching,
      `find_player_by_any_id` / `find_player_by_universal_or_legacy_id`)
      deletes entirely at end-state — `CAFC_PLAYER_ID` becomes the only key.

## Dead / vestigial code

- [ ] `CREATE INDEX IF NOT EXISTS …` statements (e.g. around
      `main.py:14564`) — Snowflake has no indexes; these throw and get
      swallowed. Delete with their try/excepts.
- [ ] `CREATE TABLE IF NOT EXISTS player_lists / player_list_items` bootstrap
      DDL inside request handlers (`main.py:~14535`) — tables exist; an app
      should not own DDL at request time. Move to a provisioning script or
      delete at end-state.
- [ ] Legacy password support comment + `SNOWFLAKE_PASSWORD` path — key-pair
      auth is the real mechanism everywhere.

## Error handling / robustness

- [ ] Column-existence fallback insert paths (`"invalid identifier 'USER_ID'"
      in str(e)` retry pattern in `create_scout_report` ~`main.py:6538`) —
      schema is stable; pick one shape and delete the fallback.
- [ ] `TABLE_SCHEMA_CACHE` + `DESCRIBE TABLE` machinery (`main.py:219-300`) —
      most consumers exist to support the fallback paths above; reassess once
      those go.
- [ ] Bare `except Exception: pass` around connection cleanup in several
      helpers — fine individually, but masks pool exhaustion patterns.
- [ ] `get_next_table_id()` (MAX(ID)+1, `main.py:279`) races under concurrent
      writes — only caller is player_information inserts; switch that table to
      AUTOINCREMENT at its CORE move and delete the helper.

## Operational

- [ ] `print()` used for logging throughout — switch to `logging` with levels
      so prod (Railway) output is filterable.
- [ ] Startup does serial `DESCRIBE TABLE` over many tables — slow cold start;
      one `INFORMATION_SCHEMA.COLUMNS` query covers all.
- [ ] `internal_recs` endpoint returns HTTP 500 for every role (pre-existing,
      identical legacy vs canonical — captured in cutover_compare baselines).
      Diagnose after cutover; it's a real bug users may not be hitting.
- [ ] `agents_recs` returns 403 for all five roles — either a missing role
      grant or dead feature; decide and delete or fix.

## Conventions for this file

Add entries as `file:line — what — why it waits`. Date entries when added.
Everything above logged 2026-06-10 during Phase 3 templating.
