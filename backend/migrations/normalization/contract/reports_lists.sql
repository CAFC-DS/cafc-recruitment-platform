-- contract/reports_lists.sql   DESTRUCTIVE - never run by default.
-- Preconditions: `--mark-cutover reports_lists`, validate/ --strict clean (no unresolved keys),
-- cutover_compare soak on search/profile/analytics/lists.
-- Rollback: CLONE the matching table from ${SNAPSHOT} (loses writes since snapshot).

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
ALTER TABLE ${CORE}.PLAYER_STAGE_HISTORY  DROP COLUMN LIST_ID, PLAYER_ID;
