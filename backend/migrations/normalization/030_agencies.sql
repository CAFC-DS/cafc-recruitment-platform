-- @sync-until-cutover: recommendations
-- 030_agencies.sql
-- 3NF. Verified on live data (2026-09-30): every recommendation's AGENT_NAME / AGENCY /
-- AGENT_EMAIL / AGENT_NUMBER is IDENTICAL to its submitter's AGENT_PROFILES row (0 of 596
-- differ), each submitter has exactly one agent identity, and there are no staff-entered
-- recommendations. So the agent columns on PLAYER_RECOMMENDATIONS are a pure transitive
-- dependency (recommendation -> SUBMITTED_BY_USER_ID -> AGENT_PROFILES) and are removed in the
-- contract phase in favour of a join; AGENT_PROFILES stays the single source of agent facts.
--
-- The one thing still un-normalized is AGENCY: free text repeated on every profile, and an
-- agency is not a property of one agent. This file introduces AGENCIES and links profiles to it.
-- (An earlier draft added a separate AGENTS table; live data showed it would be a 1:1 duplicate
-- of AGENT_PROFILES, so it was dropped.)
--
-- AGENCIES is an identity table (insert-only); AGENT_PROFILES.AGENCY_ID is a full recompute
-- because profiles are edited in place, so this file is sync-until-cutover.

CREATE OR REPLACE FUNCTION ${CORE}.NORMALIZE_NAME_KEY(v VARCHAR)
RETURNS VARCHAR
AS $$ NULLIF(LOWER(REGEXP_REPLACE(TRIM(v), '\\s+', ' ')), '') $$;

CREATE TABLE IF NOT EXISTS ${CORE}.AGENCIES (
    AGENCY_ID   NUMBER(38,0) NOT NULL AUTOINCREMENT,
    AGENCY_NAME VARCHAR(255) NOT NULL,
    AGENCY_KEY  VARCHAR(255) NOT NULL,
    CREATED_AT  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT PK_AGENCIES PRIMARY KEY (AGENCY_ID),
    CONSTRAINT UQ_AGENCIES_KEY UNIQUE (AGENCY_KEY)
);

MERGE INTO ${CORE}.AGENCIES t
USING (
    SELECT ${CORE}.NORMALIZE_NAME_KEY(AGENCY) AS AGENCY_KEY, TRIM(AGENCY) AS AGENCY_NAME
    FROM ${CORE}.AGENT_PROFILES
    WHERE ${CORE}.NORMALIZE_NAME_KEY(AGENCY) IS NOT NULL
    QUALIFY ROW_NUMBER() OVER (PARTITION BY ${CORE}.NORMALIZE_NAME_KEY(AGENCY) ORDER BY UPDATED_AT DESC NULLS LAST, USER_ID) = 1
) s ON t.AGENCY_KEY = s.AGENCY_KEY
WHEN NOT MATCHED THEN INSERT (AGENCY_NAME, AGENCY_KEY) VALUES (s.AGENCY_NAME, s.AGENCY_KEY);

ALTER TABLE ${CORE}.AGENT_PROFILES ADD COLUMN IF NOT EXISTS AGENCY_ID NUMBER(38,0);

UPDATE ${CORE}.AGENT_PROFILES ap
SET AGENCY_ID = a.AGENCY_ID
FROM ${CORE}.AGENCIES a
WHERE a.AGENCY_KEY = ${CORE}.NORMALIZE_NAME_KEY(ap.AGENCY)
  AND ap.AGENCY_ID IS DISTINCT FROM a.AGENCY_ID;

UPDATE ${CORE}.AGENT_PROFILES
SET AGENCY_ID = NULL
WHERE AGENCY_ID IS NOT NULL AND ${CORE}.NORMALIZE_NAME_KEY(AGENCY) IS NULL;
