-- swap/intel.sql
-- @recovery: ALTER TABLE ${CORE}.PLAYER_INFORMATION_LEGACY RENAME TO ${CORE}.PLAYER_INFORMATION;
-- THE SWAP: the legacy name PLAYER_INFORMATION becomes a view over the normalized intel tables. Every read of it
-- (the app's queries and the dbt APP_COMPAT.PLAYER_INFORMATION view) keeps working unchanged: same name, same 25
-- columns, same order, same types.
--
-- Runner preconditions (enforced, see --swap): the domain is marked cut over (the app already writes INTEL_REPORTS and
-- its child tables, because a view cannot be written to) and parity/intel.sql is clean.
-- Metadata-only: no data moves. The legacy table is kept as PLAYER_INFORMATION_LEGACY for rollback.
-- Everything that can fail runs BEFORE anything is renamed, and the two renames run back to back.

-- New report ids come from a sequence started ABOVE every existing id, fetched explicitly by the app.
EXECUTE IMMEDIATE $$
DECLARE
    next_id NUMBER;
BEGIN
    next_id := (SELECT GREATEST((SELECT COALESCE(MAX(ID), 0) FROM ${CORE}.INTEL_REPORTS),
                                (SELECT COALESCE(MAX(ID), 0) FROM ${CORE}.PLAYER_INFORMATION)) + 1);
    EXECUTE IMMEDIATE 'CREATE OR REPLACE SEQUENCE ${CORE}.INTEL_REPORTS_ID_SEQ START = ' || next_id || ' INCREMENT = 1';
    RETURN next_id;
END;
$$;

GRANT USAGE ON SEQUENCE ${CORE}.INTEL_REPORTS_ID_SEQ TO ROLE APP_ROLE;

-- Sync-only view over the legacy table by name; obsolete once the app owns the keys.
DROP VIEW IF EXISTS ${CORE}.V_INTEL_KEYS;

-- Compile the replacement view under a temporary name first.
CREATE OR REPLACE VIEW ${CORE}.PLAYER_INFORMATION_SWAPVIEW AS
SELECT * FROM ${CORE}.V_COMPAT_PLAYER_INFORMATION;

-- The swap itself: two back-to-back renames.
ALTER TABLE ${CORE}.PLAYER_INFORMATION RENAME TO ${CORE}.PLAYER_INFORMATION_LEGACY;
ALTER VIEW ${CORE}.PLAYER_INFORMATION_SWAPVIEW RENAME TO ${CORE}.PLAYER_INFORMATION;

GRANT SELECT ON VIEW ${CORE}.PLAYER_INFORMATION TO ROLE APP_ROLE;
GRANT SELECT ON VIEW ${CORE}.PLAYER_INFORMATION TO ROLE DEV_ROLE;

-- Writes now go to the normalized tables. Same run as the swap, so the table and the flag cannot drift apart.
UPDATE ${CORE}.APP_WRITE_FLAGS
SET NORMALIZED_WRITES = TRUE, UPDATED_AT = CURRENT_TIMESTAMP(), UPDATED_BY = CURRENT_USER()
WHERE DOMAIN = 'intel';
