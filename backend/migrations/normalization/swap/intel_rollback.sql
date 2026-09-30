-- swap/intel_rollback.sql
-- Undo the intel swap. Anything written to the normalized tables since the swap is copied BACK into the legacy
-- table first (via the compat view, which reproduces the legacy shape), so no writes are lost. Then the original
-- name is restored. The runner also un-marks the cutover so the derived tables can be re-synced.
-- After this, the app must be pointed back at the legacy write path (config flag / previous release).

-- Stop the app writing the normalized tables first (the flag is cached for a few seconds; the night freeze covers it).
UPDATE ${CORE}.APP_WRITE_FLAGS
SET NORMALIZED_WRITES = FALSE, UPDATED_AT = CURRENT_TIMESTAMP(), UPDATED_BY = CURRENT_USER()
WHERE DOMAIN = 'intel';

-- Explicit columns: the legacy table also carries CANONICAL_PLAYER_ID (added by 022), which the view does not
-- expose, so it is restored from the normalized table.
INSERT OVERWRITE INTO ${CORE}.PLAYER_INFORMATION_LEGACY (
    ID, CONTACT_NAME, CONTACT_ORGANISATION, DATE_OF_INFORMATION, CONTRACT_EXPIRY, CONTRACT_OPTIONS,
    POTENTIAL_DEAL_TYPE, TRANSFER_FEE, CURRENT_WAGES, EXPECTED_WAGES, CONVERSATION_NOTES, ACTION_REQUIRED,
    CREATED_AT, PLAYER_ID, USER_ID, DATA_SOURCE, EXPECTED_WAGES_MAX, EXPECTED_WAGES_MIN, CURRENT_WAGES_MAX,
    CURRENT_WAGES_MIN, INTEL_TYPE, RELATIONSHIP_TO_PLAYER, LENGTH_OF_RELATIONSHIP, RELEVANCE_OF_RELATIONSHIP,
    REFERENCE_RATING,
    CANONICAL_PLAYER_ID
)
SELECT
    v.ID, v.CONTACT_NAME, v.CONTACT_ORGANISATION, v.DATE_OF_INFORMATION, v.CONTRACT_EXPIRY, v.CONTRACT_OPTIONS,
    v.POTENTIAL_DEAL_TYPE, v.TRANSFER_FEE, v.CURRENT_WAGES, v.EXPECTED_WAGES, v.CONVERSATION_NOTES, v.ACTION_REQUIRED,
    v.CREATED_AT, v.PLAYER_ID, v.USER_ID, v.DATA_SOURCE, v.EXPECTED_WAGES_MAX, v.EXPECTED_WAGES_MIN, v.CURRENT_WAGES_MAX,
    v.CURRENT_WAGES_MIN, v.INTEL_TYPE, v.RELATIONSHIP_TO_PLAYER, v.LENGTH_OF_RELATIONSHIP, v.RELEVANCE_OF_RELATIONSHIP,
    v.REFERENCE_RATING,
    r.CANONICAL_PLAYER_ID
FROM ${CORE}.V_COMPAT_PLAYER_INFORMATION v
JOIN ${CORE}.INTEL_REPORTS r ON r.ID = v.ID;

DROP VIEW ${CORE}.PLAYER_INFORMATION;

ALTER TABLE ${CORE}.PLAYER_INFORMATION_LEGACY RENAME TO ${CORE}.PLAYER_INFORMATION;
