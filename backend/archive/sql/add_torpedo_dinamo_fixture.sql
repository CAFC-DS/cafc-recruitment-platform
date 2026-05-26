-- ==============================================================================
-- ADD FIXTURE: Torpedo Kutaisi vs Dinamo Tbilisi (27/09/2025)
-- ==============================================================================
-- This script adds the fixture with minimal data since teams don't exist in DB
-- ==============================================================================

-- STEP 1: (OPTIONAL) Check if Georgia exists as a country
-- ==============================================================================
-- Run this query first to see if Georgia exists in your database:
--
-- SELECT DISTINCT HOMESQUADCOUNTRYID, HOMESQUADCOUNTRYNAME
-- FROM MATCHES
-- WHERE UPPER(HOMESQUADCOUNTRYNAME) = 'GEORGIA'
-- LIMIT 1;
--
-- If Georgia exists, you can use SCENARIO B below instead of SCENARIO A


-- ==============================================================================
-- SCENARIO A: Insert fixture WITHOUT country metadata (simplest approach)
-- ==============================================================================
-- Use this if you couldn't find Georgia in the database

INSERT INTO MATCHES (
    HOMESQUADNAME,
    AWAYSQUADNAME,
    SCHEDULEDDATE,
    CAFC_MATCH_ID,
    DATA_SOURCE
) VALUES (
    'Torpedo Kutaisi',              -- Home team name
    'Dinamo Tbilisi',               -- Away team name
    '2025-09-27',                   -- Match date (YYYY-MM-DD format)
    manual_match_seq.NEXTVAL,       -- Auto-generate next CAFC_MATCH_ID
    'internal'                      -- DATA_SOURCE
);


-- ==============================================================================
-- SCENARIO B: Insert fixture WITH Georgia metadata (if Georgia exists)
-- ==============================================================================
-- Use this INSTEAD of SCENARIO A if you found Georgia exists in your database
-- Replace GEORGIA_COUNTRY_ID with the actual ID from the query above

-- INSERT INTO MATCHES (
--     HOMESQUADNAME,
--     AWAYSQUADNAME,
--     SCHEDULEDDATE,
--     -- Both teams are from Georgia
--     HOMESQUADCOUNTRYID,
--     HOMESQUADCOUNTRYNAME,
--     AWAYSQUADCOUNTRYID,
--     AWAYSQUADCOUNTRYNAME,
--     -- Both teams are clubs
--     HOMESQUADTYPE,
--     AWAYSQUADTYPE,
--     -- Internal match identifiers
--     CAFC_MATCH_ID,
--     DATA_SOURCE
-- ) VALUES (
--     'Torpedo Kutaisi',              -- Home team name
--     'Dinamo Tbilisi',               -- Away team name
--     '2025-09-27',                   -- Match date
--     GEORGIA_COUNTRY_ID,             -- Home team country ID (replace with actual ID)
--     'Georgia',                      -- Home team country name
--     GEORGIA_COUNTRY_ID,             -- Away team country ID (replace with actual ID)
--     'Georgia',                      -- Away team country name
--     'CLUB',                         -- Home team type
--     'CLUB',                         -- Away team type
--     manual_match_seq.NEXTVAL,       -- Auto-generate next CAFC_MATCH_ID
--     'internal'                      -- DATA_SOURCE
-- );


-- ==============================================================================
-- STEP 2: Verify the insertion
-- ==============================================================================
-- Run this to confirm the fixture was added successfully:

SELECT
    CAFC_MATCH_ID,
    HOMESQUADNAME,
    AWAYSQUADNAME,
    SCHEDULEDDATE,
    HOMESQUADCOUNTRYNAME,
    AWAYSQUADCOUNTRYNAME,
    DATA_SOURCE
FROM MATCHES
WHERE HOMESQUADNAME = 'Torpedo Kutaisi'
  AND AWAYSQUADNAME = 'Dinamo Tbilisi'
  AND SCHEDULEDDATE = '2025-09-27';
