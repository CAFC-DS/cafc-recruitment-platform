-- contract/recommendations.sql   DESTRUCTIVE - never run by default.
-- Drops the legacy denormalized columns of the recommendations domain.
-- Preconditions (the runner enforces the first two):
--   1. `--mark-cutover recommendations` recorded in the ledger (app reads/writes the new tables)
--   2. validate/ passes with --strict
--   3. cutover_compare shows no diff for agents_recs / internal_recs for a full soak
-- Rollback: CREATE OR REPLACE TABLE ... CLONE ${SNAPSHOT}.PLAYER_RECOMMENDATIONS (loses writes since snapshot).
-- Kept on purpose: PLAYER_NAME / PLAYER_DATE_OF_BIRTH (an agent's claim about a player).

DROP VIEW IF EXISTS ${CORE}.V_RECOMMENDATION_KEYS;

-- Agent facts: identical to the submitter's AGENT_PROFILES row (warn_090 must be empty), so the app reads
-- them by joining AGENT_PROFILES on SUBMITTED_BY_USER_ID. AGENT_PROFILES itself stays the source of truth.
ALTER TABLE ${CORE}.PLAYER_RECOMMENDATIONS DROP COLUMN
    LINKED_UNIVERSAL_ID,
    AGENT_NAME, AGENCY, AGENT_EMAIL, AGENT_NUMBER,
    AGREEMENT_TYPE, CONTRACT_OPTIONS, RECOMMENDED_POSITION, POTENTIAL_DEAL_TYPE,
    TRANSFER_FEE, TRANSFER_FEE_AMOUNT, TRANSFER_FEE_CURRENCY, TRANSFER_FEE_MIN, TRANSFER_FEE_MAX,
    CURRENT_WAGES, CURRENT_WAGES_AMOUNT, CURRENT_WAGES_CURRENCY, CURRENT_WAGES_MIN, CURRENT_WAGES_MAX,
    EXPECTED_WAGES, EXPECTED_WAGES_AMOUNT, EXPECTED_WAGES_CURRENCY, EXPECTED_WAGES_MIN, EXPECTED_WAGES_MAX,
    WAGE_BASIS;

-- The free-text agency on the profile is replaced by AGENCY_ID (AGENT_NAME/EMAIL/NUMBER stay).
ALTER TABLE ${CORE}.AGENT_PROFILES DROP COLUMN AGENCY;
