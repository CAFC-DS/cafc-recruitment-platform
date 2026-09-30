-- contract/intel.sql   DESTRUCTIVE - never run by default.
-- Preconditions: `--mark-cutover intel`, validate/ --strict clean, cutover_compare soak.
-- Rollback: CLONE ${SNAPSHOT}.PLAYER_INFORMATION (loses writes since snapshot).

ALTER TABLE ${CORE}.PLAYER_INFORMATION DROP COLUMN
    CONTACT_NAME, CONTACT_ORGANISATION,
    POTENTIAL_DEAL_TYPE, RELATIONSHIP_TO_PLAYER,
    LENGTH_OF_RELATIONSHIP, RELEVANCE_OF_RELATIONSHIP, REFERENCE_RATING,
    TRANSFER_FEE,
    CURRENT_WAGES, CURRENT_WAGES_MIN, CURRENT_WAGES_MAX,
    EXPECTED_WAGES, EXPECTED_WAGES_MIN, EXPECTED_WAGES_MAX;

-- Dual player reference -> single key.
-- The rename CANONICAL_PLAYER_ID -> CAFC_PLAYER_ID is deliberately NOT done: the dbt view
-- APP_COMPAT.PLAYER_INFORMATION is `select pi.*, r.cafc_player_id AS CAFC_PLAYER_ID ...`, so the
-- rename would give it a duplicate column. Keep the CANONICAL_PLAYER_ID name.
-- V_INTEL_KEYS is kept: it reads PLAYER_ID / DATA_SOURCE, which are not dropped here (deferred above).
-- DEFERRED (not run here): dropping PLAYER_ID / DATA_SOURCE. The dbt view
-- APP_COMPAT.PLAYER_INFORMATION joins on pi.PLAYER_ID explicitly and would fail. Do it in the
-- release that rewrites that dbt model to use CANONICAL_PLAYER_ID (see docs plan 'Dependents').
