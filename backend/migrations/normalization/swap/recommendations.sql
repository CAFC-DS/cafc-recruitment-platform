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

-- New ids for the normalized table come from a sequence, started ABOVE every existing id (legacy and normalized).
-- Fetched explicitly by the app, so there is no 'newest row' read-back race. Runs at the freeze, when nothing else writes.
EXECUTE IMMEDIATE $$
DECLARE
    next_id NUMBER;
BEGIN
    next_id := (SELECT GREATEST((SELECT COALESCE(MAX(ID), 0) FROM ${CORE}.RECOMMENDATIONS),
                                (SELECT COALESCE(MAX(ID), 0) FROM ${CORE}.PLAYER_RECOMMENDATIONS)) + 1);
    EXECUTE IMMEDIATE 'CREATE OR REPLACE SEQUENCE ${CORE}.RECOMMENDATIONS_ID_SEQ START = ' || next_id || ' INCREMENT = 1';
    RETURN next_id;
END;
$$;

GRANT USAGE ON SEQUENCE ${CORE}.RECOMMENDATIONS_ID_SEQ TO ROLE APP_ROLE;

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

-- Writes now go to the normalized tables. Same run as the swap, so the table and the flag cannot drift apart.
UPDATE ${CORE}.APP_WRITE_FLAGS
SET NORMALIZED_WRITES = TRUE, UPDATED_AT = CURRENT_TIMESTAMP(), UPDATED_BY = CURRENT_USER()
WHERE DOMAIN = 'recommendations';
