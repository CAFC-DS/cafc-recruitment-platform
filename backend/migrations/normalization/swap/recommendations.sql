-- swap/recommendations.sql
-- @recovery: ALTER TABLE ${CORE}.PLAYER_RECOMMENDATIONS_LEGACY RENAME TO ${CORE}.PLAYER_RECOMMENDATIONS;
-- THE SWAP: the legacy name PLAYER_RECOMMENDATIONS becomes a view over the normalized tables.
-- Every one of the app's read queries keeps working unchanged (same name, same 41 columns, same order).
--
-- Runner preconditions (enforced, see --swap): the domain is marked cut over, meaning the app already writes
-- RECOMMENDATIONS + its child tables (a view cannot be written to), and parity/recommendations.sql is clean.
--
-- It is a metadata-only change: no data moves, it takes milliseconds, and the legacy table is kept as
-- PLAYER_RECOMMENDATIONS_LEGACY for rollback (swap/recommendations_rollback.sql).
--
-- DDL cannot be rolled back in Snowflake, so the order is chosen to keep the risky window tiny: everything that
-- can fail (dropping the FK, compiling the new view) runs BEFORE anything is renamed, and the two renames that
-- swap the names run back to back. If a statement fails after the table rename, the runner prints the
-- '@recovery' statement above; it restores the original name.

-- The declared FK from the notes history follows a renamed table, so repoint it at the normalized parent.
ALTER TABLE ${CORE}.RECOMMENDATION_NOTES_HISTORY
    DROP FOREIGN KEY (RECOMMENDATION_ID);

-- Views that read the legacy table by name would follow it to *_LEGACY; the key view is sync-only and obsolete now.
DROP VIEW IF EXISTS ${CORE}.V_RECOMMENDATION_KEYS;

-- Compile and validate the replacement view under a temporary name first.
CREATE OR REPLACE VIEW ${CORE}.PLAYER_RECOMMENDATIONS_SWAPVIEW AS
SELECT * FROM ${CORE}.V_COMPAT_PLAYER_RECOMMENDATIONS;

-- The swap itself: two back-to-back renames.
ALTER TABLE ${CORE}.PLAYER_RECOMMENDATIONS RENAME TO ${CORE}.PLAYER_RECOMMENDATIONS_LEGACY;
ALTER VIEW ${CORE}.PLAYER_RECOMMENDATIONS_SWAPVIEW RENAME TO ${CORE}.PLAYER_RECOMMENDATIONS;

ALTER TABLE ${CORE}.RECOMMENDATION_NOTES_HISTORY
    ADD FOREIGN KEY (RECOMMENDATION_ID) REFERENCES ${CORE}.RECOMMENDATIONS (ID);

GRANT SELECT ON VIEW ${CORE}.PLAYER_RECOMMENDATIONS TO ROLE APP_ROLE;
GRANT SELECT ON VIEW ${CORE}.PLAYER_RECOMMENDATIONS TO ROLE DEV_ROLE;
