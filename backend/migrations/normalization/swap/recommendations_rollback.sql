-- swap/recommendations_rollback.sql
-- Undo the swap. Anything written to the normalized tables since the swap is copied BACK into the legacy
-- table first (via the compat view, which reproduces the legacy shape), so no writes are lost. Then the
-- original name is restored. The runner also un-marks the cutover so the derived tables can be re-synced.
--
-- After this, the app must be pointed back at the legacy write path (config flag / previous release).

-- First stop the app writing the normalized tables (the flag is cached for a few seconds; the night freeze covers it).
UPDATE ${CORE}.APP_WRITE_FLAGS
SET NORMALIZED_WRITES = FALSE, UPDATED_AT = CURRENT_TIMESTAMP(), UPDATED_BY = CURRENT_USER()
WHERE DOMAIN = 'recommendations';

-- How many ids the normalized tables issued beyond the legacy table's highest id. Captured BEFORE the copy-back
-- overwrites the legacy rows, and used afterwards to advance the legacy identity counter (see the pad step below).
CREATE OR REPLACE TEMPORARY TABLE ${CORE}.ROLLBACK_PAD AS
SELECT GREATEST(0, (SELECT COALESCE(MAX(ID), 0) FROM ${CORE}.RECOMMENDATIONS)
                 - (SELECT COALESCE(MAX(ID), 0) FROM ${CORE}.PLAYER_RECOMMENDATIONS_LEGACY)) AS N;

-- Explicit columns: the legacy table also carries LINKED_CANONICAL_PLAYER_ID (added by 021), which the view
-- does not expose, so it is restored from the normalized table.
INSERT OVERWRITE INTO ${CORE}.PLAYER_RECOMMENDATIONS_LEGACY (
    ID, AGENT_NAME, AGENCY, AGENT_EMAIL, AGENT_NUMBER, DATE, TRANSFERMARKT_LINK, AGREEMENT_TYPE,
    CONTRACT_EXPIRY, CONTRACT_OPTIONS, POTENTIAL_DEAL_TYPE, TRANSFER_FEE, CURRENT_WAGES, EXPECTED_WAGES,
    ADDITIONAL_INFO, PLAYER_NAME, SUBMITTED_BY_USER_ID, STATUS, STATUS_UPDATED_AT, STATUS_UPDATED_BY,
    INTERNAL_NOTES, UPDATED_AT, CREATED_AT, EXPECTED_WAGES_CURRENCY, EXPECTED_WAGES_AMOUNT,
    CURRENT_WAGES_CURRENCY, CURRENT_WAGES_AMOUNT, TRANSFER_FEE_CURRENCY, TRANSFER_FEE_AMOUNT,
    RECOMMENDED_POSITION, PLAYER_DATE_OF_BIRTH, AGENT_STATUS, AGENT_STATUS_UPDATED_AT, EXPECTED_WAGES_MAX,
    EXPECTED_WAGES_MIN, CURRENT_WAGES_MAX, CURRENT_WAGES_MIN, WAGE_BASIS, TRANSFER_FEE_MAX, TRANSFER_FEE_MIN,
    LINKED_UNIVERSAL_ID,
    LINKED_CANONICAL_PLAYER_ID
)
SELECT
    v.ID, v.AGENT_NAME, v.AGENCY, v.AGENT_EMAIL, v.AGENT_NUMBER, v.DATE, v.TRANSFERMARKT_LINK,
    v.AGREEMENT_TYPE, v.CONTRACT_EXPIRY, v.CONTRACT_OPTIONS, v.POTENTIAL_DEAL_TYPE, v.TRANSFER_FEE,
    v.CURRENT_WAGES, v.EXPECTED_WAGES, v.ADDITIONAL_INFO, v.PLAYER_NAME, v.SUBMITTED_BY_USER_ID, v.STATUS,
    v.STATUS_UPDATED_AT, v.STATUS_UPDATED_BY, v.INTERNAL_NOTES, v.UPDATED_AT, v.CREATED_AT,
    v.EXPECTED_WAGES_CURRENCY, v.EXPECTED_WAGES_AMOUNT, v.CURRENT_WAGES_CURRENCY, v.CURRENT_WAGES_AMOUNT,
    v.TRANSFER_FEE_CURRENCY, v.TRANSFER_FEE_AMOUNT, v.RECOMMENDED_POSITION, v.PLAYER_DATE_OF_BIRTH,
    v.AGENT_STATUS, v.AGENT_STATUS_UPDATED_AT, v.EXPECTED_WAGES_MAX, v.EXPECTED_WAGES_MIN,
    v.CURRENT_WAGES_MAX, v.CURRENT_WAGES_MIN, v.WAGE_BASIS, v.TRANSFER_FEE_MAX, v.TRANSFER_FEE_MIN,
    v.LINKED_UNIVERSAL_ID,
    r.LINKED_CANONICAL_PLAYER_ID
FROM ${CORE}.V_COMPAT_PLAYER_RECOMMENDATIONS v
JOIN ${CORE}.RECOMMENDATIONS r ON r.ID = v.ID;

-- The legacy table keeps its own identity counter, which did not advance while the normalized tables were live. Ids
-- issued there are now in the restored rows, so without this the legacy table could hand out an id that already
-- exists (the primary key is not enforced, so it would silently duplicate). Inserting N placeholder rows moves the
-- counter past every id in use (each insert advances it by at least one), then the placeholders are removed.
INSERT INTO ${CORE}.PLAYER_RECOMMENDATIONS_LEGACY (SUBMITTED_BY_USER_ID, PLAYER_NAME)
SELECT 0, '__ROLLBACK_PAD__'
FROM TABLE(GENERATOR(ROWCOUNT => 1000000))
QUALIFY ROW_NUMBER() OVER (ORDER BY SEQ4()) <= (SELECT N FROM ${CORE}.ROLLBACK_PAD);

DELETE FROM ${CORE}.PLAYER_RECOMMENDATIONS_LEGACY WHERE PLAYER_NAME = '__ROLLBACK_PAD__';

DROP TABLE IF EXISTS ${CORE}.ROLLBACK_PAD;

ALTER TABLE ${CORE}.RECOMMENDATION_NOTES_HISTORY
    DROP FOREIGN KEY (RECOMMENDATION_ID);

DROP VIEW ${CORE}.PLAYER_RECOMMENDATIONS;

ALTER TABLE ${CORE}.PLAYER_RECOMMENDATIONS_LEGACY RENAME TO ${CORE}.PLAYER_RECOMMENDATIONS;

ALTER TABLE ${CORE}.RECOMMENDATION_NOTES_HISTORY
    ADD FOREIGN KEY (RECOMMENDATION_ID) REFERENCES ${CORE}.PLAYER_RECOMMENDATIONS (ID);
