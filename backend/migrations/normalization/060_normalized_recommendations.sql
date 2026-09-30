-- @sync-until-cutover: recommendations
-- 060_normalized_recommendations.sql
-- The NORMALIZED base table for recommendations: RECOMMENDATIONS. It holds only facts about the
-- recommendation itself. Everything the legacy PLAYER_RECOMMENDATIONS table repeated lives elsewhere:
--   agent name/agency/email/number   -> AGENT_PROFILES  (via SUBMITTED_BY_USER_ID; verified identical on all rows)
--   fee / current wages / expected wages (amount, min, max, currency) -> RECOMMENDATION_TERMS
--   position / deal type / agreement type / contract options (comma lists) -> the four junction tables (040)
--
-- Two columns are kept ONLY because they cannot be derived, so the legacy-shaped compat view can reproduce
-- every legacy row byte for byte. Both are DEPRECATED and dropped in the contract phase:
--   LINKED_UNIVERSAL_ID  the packed 'external_<id>' string; 29 of the 575 values no longer resolve to a player,
--                        so they cannot be rebuilt from LINKED_CANONICAL_PLAYER_ID
--   TRANSFER_FEE_TEXT    the free-text fee the agent typed; 80 rows have text but no parseable amount
--
-- WAGE_BASIS is one value per recommendation (it covers both current and expected wages), so it lives here,
-- not on each term.
--
-- Derived copy of PLAYER_RECOMMENDATIONS until the recommendations domain cuts over; the rebuild runs in
-- one transaction and the runner refuses to re-run it after `--mark-cutover recommendations`.

CREATE TABLE IF NOT EXISTS ${CORE}.RECOMMENDATIONS (
    ID                         NUMBER(38,0)  NOT NULL,
    SUBMITTED_BY_USER_ID       NUMBER(38,0)  NOT NULL,
    PLAYER_NAME                VARCHAR(255),
    PLAYER_DATE_OF_BIRTH       DATE,
    DATE                       DATE,
    TRANSFERMARKT_LINK         VARCHAR,
    CONTRACT_EXPIRY            DATE,
    ADDITIONAL_INFO            VARCHAR,
    INTERNAL_NOTES             VARCHAR(5000),
    WAGE_BASIS                 VARCHAR(10),
    STATUS                     VARCHAR(100),
    STATUS_UPDATED_AT          TIMESTAMP_NTZ,
    STATUS_UPDATED_BY          NUMBER(38,0),
    AGENT_STATUS               VARCHAR(100),
    AGENT_STATUS_UPDATED_AT    TIMESTAMP_NTZ,
    LINKED_CANONICAL_PLAYER_ID NUMBER(38,0),
    LINKED_UNIVERSAL_ID        VARCHAR,       -- DEPRECATED, see header
    TRANSFER_FEE_TEXT          VARCHAR,       -- DEPRECATED, see header
    CREATED_AT                 TIMESTAMP_NTZ,
    UPDATED_AT                 TIMESTAMP_NTZ,
    CONSTRAINT PK_RECOMMENDATIONS PRIMARY KEY (ID)
);

BEGIN;

DELETE FROM ${CORE}.RECOMMENDATIONS;

INSERT INTO ${CORE}.RECOMMENDATIONS
    (ID, SUBMITTED_BY_USER_ID, PLAYER_NAME, PLAYER_DATE_OF_BIRTH, DATE, TRANSFERMARKT_LINK, CONTRACT_EXPIRY,
     ADDITIONAL_INFO, INTERNAL_NOTES, WAGE_BASIS, STATUS, STATUS_UPDATED_AT, STATUS_UPDATED_BY, AGENT_STATUS,
     AGENT_STATUS_UPDATED_AT, LINKED_CANONICAL_PLAYER_ID, LINKED_UNIVERSAL_ID, TRANSFER_FEE_TEXT, CREATED_AT, UPDATED_AT)
SELECT ID, SUBMITTED_BY_USER_ID, PLAYER_NAME, PLAYER_DATE_OF_BIRTH, DATE, TRANSFERMARKT_LINK, CONTRACT_EXPIRY,
       ADDITIONAL_INFO, INTERNAL_NOTES, WAGE_BASIS, STATUS, STATUS_UPDATED_AT, STATUS_UPDATED_BY, AGENT_STATUS,
       AGENT_STATUS_UPDATED_AT, LINKED_CANONICAL_PLAYER_ID, LINKED_UNIVERSAL_ID, TRANSFER_FEE, CREATED_AT, UPDATED_AT
FROM ${CORE}.PLAYER_RECOMMENDATIONS;

COMMIT;
