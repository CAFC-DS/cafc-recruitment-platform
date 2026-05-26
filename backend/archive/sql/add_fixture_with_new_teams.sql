-- ==============================================================================
-- ADD FIXTURE WITH NEW TEAMS (TEAMS NOT IN DATABASE)
-- ==============================================================================
-- This script adds a fixture where one or both teams don't exist in the database yet.
-- If a team exists in external matches, we can populate its metadata automatically.
-- If a team doesn't exist anywhere, we insert it with minimal data (just name).
-- ==============================================================================

-- STEP 1: Check if teams exist in external matches and get their metadata
-- ==============================================================================
-- Run these queries first to see if your teams exist:

-- Check for home team:
-- SELECT DISTINCT
--     HOMESQUADNAME, HOMESQUADID, HOMESQUADTYPE, HOMESQUADCOUNTRYID,
--     HOMESQUADCOUNTRYNAME, HOMESQUADSKILLCORNERID, HOMESQUADHEIMSPIELID,
--     HOMESQUADWYSCOUTID
-- FROM MATCHES
-- WHERE DATA_SOURCE = 'external'
--   AND UPPER(HOMESQUADNAME) = UPPER('YOUR_HOME_TEAM_NAME');

-- Check for away team:
-- SELECT DISTINCT
--     AWAYSQUADNAME, AWAYSQUADID, AWAYSQUADTYPE, AWAYSQUADCOUNTRYID,
--     AWAYSQUADCOUNTRYNAME, AWAYSQUADSKILLCORNERID, AWAYSQUADHEIMSPIELID,
--     AWAYSQUADWYSCOUTID
-- FROM MATCHES
-- WHERE DATA_SOURCE = 'external'
--   AND UPPER(AWAYSQUADNAME) = UPPER('YOUR_AWAY_TEAM_NAME');


-- STEP 2: Insert the fixture
-- ==============================================================================
-- SCENARIO A: Both teams exist in external data (full metadata available)
-- Replace the values below with your actual data from STEP 1
-- ==============================================================================

INSERT INTO MATCHES (
    HOMESQUADNAME,
    AWAYSQUADNAME,
    SCHEDULEDDATE,
    -- Home team metadata (from external matches if available)
    HOMESQUADID,
    HOMESQUADTYPE,
    HOMESQUADCOUNTRYID,
    HOMESQUADCOUNTRYNAME,
    HOMESQUADSKILLCORNERID,
    HOMESQUADHEIMSPIELID,
    HOMESQUADWYSCOUTID,
    -- Away team metadata (from external matches if available)
    AWAYSQUADID,
    AWAYSQUADTYPE,
    AWAYSQUADCOUNTRYID,
    AWAYSQUADCOUNTRYNAME,
    AWAYSQUADSKILLCORNERID,
    AWAYSQUADHEIMSPIELID,
    AWAYSQUADWYSCOUTID,
    -- Internal match identifiers
    CAFC_MATCH_ID,
    DATA_SOURCE
) VALUES (
    'Arsenal FC',                    -- Home team name
    'Manchester City',               -- Away team name
    '2025-11-15',                   -- Match date (YYYY-MM-DD)
    -- Home team metadata (example values - replace with actual data)
    13,                             -- HOMESQUADID
    'CLUB',                         -- HOMESQUADTYPE
    549,                            -- HOMESQUADCOUNTRYID (England)
    'England',                      -- HOMESQUADCOUNTRYNAME
    11,                             -- HOMESQUADSKILLCORNERID
    11,                             -- HOMESQUADHEIMSPIELID
    1611,                           -- HOMESQUADWYSCOUTID
    -- Away team metadata (example values - replace with actual data)
    981,                            -- AWAYSQUADID
    'CLUB',                         -- AWAYSQUADTYPE
    549,                            -- AWAYSQUADCOUNTRYID (England)
    'England',                      -- AWAYSQUADCOUNTRYNAME
    1750,                           -- AWAYSQUADSKILLCORNERID
    1351,                           -- AWAYSQUADHEIMSPIELID
    1625,                           -- AWAYSQUADWYSCOUTID
    -- Internal match ID and source
    manual_match_seq.NEXTVAL,       -- Auto-generate next CAFC_MATCH_ID
    'internal'                      -- DATA_SOURCE
);


-- ==============================================================================
-- SCENARIO B: One or both teams DON'T exist in external data (minimal data)
-- Use this when teams are completely new to the database
-- ==============================================================================

-- INSERT INTO MATCHES (
--     HOMESQUADNAME,
--     AWAYSQUADNAME,
--     SCHEDULEDDATE,
--     CAFC_MATCH_ID,
--     DATA_SOURCE
-- ) VALUES (
--     'New Team FC',                  -- Home team name (not in database)
--     'Another New Team',             -- Away team name (not in database)
--     '2025-11-15',                  -- Match date (YYYY-MM-DD)
--     manual_match_seq.NEXTVAL,      -- Auto-generate next CAFC_MATCH_ID
--     'internal'                     -- DATA_SOURCE
-- );


-- ==============================================================================
-- SCENARIO C: Mix - one team exists, one doesn't
-- Use this when only home team has metadata available
-- ==============================================================================

-- INSERT INTO MATCHES (
--     HOMESQUADNAME,
--     AWAYSQUADNAME,
--     SCHEDULEDDATE,
--     -- Only home team metadata
--     HOMESQUADID,
--     HOMESQUADTYPE,
--     HOMESQUADCOUNTRYID,
--     HOMESQUADCOUNTRYNAME,
--     HOMESQUADSKILLCORNERID,
--     HOMESQUADHEIMSPIELID,
--     HOMESQUADWYSCOUTID,
--     -- Away team has no metadata (NULL for all fields)
--     CAFC_MATCH_ID,
--     DATA_SOURCE
-- ) VALUES (
--     'Existing Team FC',            -- Home team (exists in external data)
--     'Brand New Team',              -- Away team (not in database)
--     '2025-11-15',
--     -- Home team metadata (from external matches)
--     123,                           -- HOMESQUADID
--     'CLUB',                        -- HOMESQUADTYPE
--     549,                           -- HOMESQUADCOUNTRYID
--     'England',                     -- HOMESQUADCOUNTRYNAME
--     456,                           -- HOMESQUADSKILLCORNERID
--     789,                           -- HOMESQUADHEIMSPIELID
--     1234,                          -- HOMESQUADWYSCOUTID
--     manual_match_seq.NEXTVAL,
--     'internal'
-- );


-- ==============================================================================
-- STEP 3: Verify the insertion
-- ==============================================================================

-- Check the newly inserted match:
-- SELECT
--     CAFC_MATCH_ID,
--     HOMESQUADNAME,
--     AWAYSQUADNAME,
--     SCHEDULEDDATE,
--     HOMESQUADID,
--     AWAYSQUADID,
--     DATA_SOURCE
-- FROM MATCHES
-- WHERE DATA_SOURCE = 'internal'
-- ORDER BY CAFC_MATCH_ID DESC
-- LIMIT 5;


-- ==============================================================================
-- HELPFUL QUERIES
-- ==============================================================================

-- Find all unique teams in external matches (to check if a team exists):
-- SELECT DISTINCT team_name, squad_id, squad_type, squad_country_name
-- FROM (
--     SELECT HOMESQUADNAME as team_name, HOMESQUADID as squad_id,
--            HOMESQUADTYPE as squad_type, HOMESQUADCOUNTRYNAME as squad_country_name
--     FROM MATCHES WHERE DATA_SOURCE = 'external' AND HOMESQUADNAME IS NOT NULL
--     UNION
--     SELECT AWAYSQUADNAME as team_name, AWAYSQUADID as squad_id,
--            AWAYSQUADTYPE as squad_type, AWAYSQUADCOUNTRYNAME as squad_country_name
--     FROM MATCHES WHERE DATA_SOURCE = 'external' AND AWAYSQUADNAME IS NOT NULL
-- ) teams
-- WHERE UPPER(team_name) LIKE UPPER('%SEARCH_TERM%')
-- ORDER BY team_name;

-- Get complete metadata for a specific team:
-- SELECT DISTINCT
--     team_name, squad_id, squad_type, squad_country_id, squad_country_name,
--     squad_skillcorner_id, squad_heimspiel_id, squad_wyscout_id
-- FROM (
--     SELECT
--         HOMESQUADNAME as team_name,
--         HOMESQUADID as squad_id,
--         HOMESQUADTYPE as squad_type,
--         HOMESQUADCOUNTRYID as squad_country_id,
--         HOMESQUADCOUNTRYNAME as squad_country_name,
--         HOMESQUADSKILLCORNERID as squad_skillcorner_id,
--         HOMESQUADHEIMSPIELID as squad_heimspiel_id,
--         HOMESQUADWYSCOUTID as squad_wyscout_id
--     FROM MATCHES
--     WHERE DATA_SOURCE = 'external' AND HOMESQUADNAME IS NOT NULL
--     UNION
--     SELECT
--         AWAYSQUADNAME as team_name,
--         AWAYSQUADID as squad_id,
--         AWAYSQUADTYPE as squad_type,
--         AWAYSQUADCOUNTRYID as squad_country_id,
--         AWAYSQUADCOUNTRYNAME as squad_country_name,
--         AWAYSQUADSKILLCORNERID as squad_skillcorner_id,
--         AWAYSQUADHEIMSPIELID as squad_heimspiel_id,
--         AWAYSQUADWYSCOUTID as squad_wyscout_id
--     FROM MATCHES
--     WHERE DATA_SOURCE = 'external' AND AWAYSQUADNAME IS NOT NULL
-- ) teams
-- WHERE UPPER(team_name) = UPPER('YOUR_TEAM_NAME')
-- LIMIT 1;
