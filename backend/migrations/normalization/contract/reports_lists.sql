-- contract/reports_lists.sql   DESTRUCTIVE - never run by default.
-- Also required first (see docs plan, 'Dependents'): the dbt views APP_COMPAT.SCOUT_REPORTS / PLAYER_LIST_ITEMS /
-- PLAYER_LIST_FLAGS are `select *` passthroughs, and /admin/merge-players + /admin/merge-duplicate-match +
-- the platform remap scripts must already write the canonical columns themselves.
-- Preconditions: `--mark-cutover reports_lists`, validate/ --strict clean (no unresolved keys),
-- cutover_compare soak on search/profile/analytics/lists.
-- Rollback: CLONE the matching table from ${SNAPSHOT} (loses writes since snapshot).

-- The expected-key views read the legacy columns; drop them before the columns.
DROP VIEW IF EXISTS ${CORE}.V_SCOUT_REPORT_KEYS;
DROP VIEW IF EXISTS ${CORE}.V_PLAYER_LIST_ITEM_KEYS;
DROP VIEW IF EXISTS ${CORE}.V_PLAYER_LIST_FLAG_KEYS;

-- Scout reports: dual player key and overloaded MATCH_ID -> one canonical key each.
ALTER TABLE ${CORE}.SCOUT_REPORTS DROP COLUMN PLAYER_ID, CAFC_PLAYER_ID, MATCH_ID;
ALTER TABLE ${CORE}.SCOUT_REPORTS RENAME COLUMN CANONICAL_PLAYER_ID  TO CAFC_PLAYER_ID;
ALTER TABLE ${CORE}.SCOUT_REPORTS RENAME COLUMN CANONICAL_FIXTURE_ID TO CAFC_FIXTURE_ID;

-- List items.
ALTER TABLE ${CORE}.PLAYER_LIST_ITEMS DROP COLUMN PLAYER_ID, CAFC_PLAYER_ID;
ALTER TABLE ${CORE}.PLAYER_LIST_ITEMS RENAME COLUMN CANONICAL_PLAYER_ID TO CAFC_PLAYER_ID;

-- Flags: packed 'internal_N' / 'external_N' string -> number.
ALTER TABLE ${CORE}.PLAYER_LIST_FLAGS DROP COLUMN UNIVERSAL_ID;

-- 3NF: redundant columns. (SHARED_REPORT_LINKS has no SHARE_URL and CREATED_BY is already a
-- numeric user id - verified against the live schema - so nothing to drop there.)
-- Only LIST_ID: the dbt view APP_COMPAT.PLAYER_STAGE_HISTORY references PLAYER_ID and
-- CAFC_PLAYER_ID explicitly, so those stay until that model is rewritten. 44 rows currently
-- disagree with their list item (warn_090); reconcile them first or this drop loses information.
ALTER TABLE ${CORE}.PLAYER_STAGE_HISTORY  DROP COLUMN LIST_ID;
