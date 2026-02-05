-- Snowflake NORMALIZE_TEXT_UDF Testing Script
-- Run these queries in Snowflake console to verify accent-insensitive behavior
-- IMPORTANT: First create the UDF using create_normalize_udf.sql

-- ============================================
-- TEST 1: Basic UDF Functionality
-- ============================================
SELECT
    NORMALIZE_TEXT_UDF('Róbert') AS test_robert,
    NORMALIZE_TEXT_UDF('Boženík') AS test_bozenik,
    NORMALIZE_TEXT_UDF('José') AS test_jose,
    NORMALIZE_TEXT_UDF('Óscar') AS test_oscar,
    NORMALIZE_TEXT_UDF('Márton') AS test_marton,
    NORMALIZE_TEXT_UDF('João') AS test_joao;

-- Expected: robert | bozenik | jose | oscar | marton | joao

-- ============================================
-- TEST 2: Accent-Insensitive Equality
-- ============================================
SELECT
    NORMALIZE_TEXT_UDF('Róbert') = NORMALIZE_TEXT_UDF('Robert') AS test_robert,
    NORMALIZE_TEXT_UDF('Boženík') = NORMALIZE_TEXT_UDF('Bozenik') AS test_bozenik,
    NORMALIZE_TEXT_UDF('José') = NORMALIZE_TEXT_UDF('Jose') AS test_jose,
    NORMALIZE_TEXT_UDF('Óscar') = NORMALIZE_TEXT_UDF('Oscar') AS test_oscar;

-- Expected: All columns should return TRUE

-- ============================================
-- TEST 3: ILIKE Pattern Matching with UDF
-- ============================================
SELECT
    NORMALIZE_TEXT_UDF('Róbert Boženík') ILIKE '%robert%' AS test1,
    NORMALIZE_TEXT_UDF('Róbert Boženík') ILIKE '%bozenik%' AS test2,
    NORMALIZE_TEXT_UDF('Róbert Boženík') ILIKE '%robert bozenik%' AS test3,
    NORMALIZE_TEXT_UDF('José Óscar') ILIKE '%jose oscar%' AS test4;

-- Expected: All should return TRUE

-- ============================================
-- TEST 4: Real Player Search (if Robert Bozenik exists)
-- ============================================
SELECT PLAYERNAME, POSITION, SQUADNAME
FROM players
WHERE NORMALIZE_TEXT_UDF(PLAYERNAME) ILIKE '%robert bozenik%'
LIMIT 10;

-- Expected: Should find "Róbert Boženík"

-- ============================================
-- TEST 5: Search for Various Accented Names
-- ============================================
SELECT PLAYERNAME, POSITION, SQUADNAME
FROM players
WHERE NORMALIZE_TEXT_UDF(PLAYERNAME) ILIKE '%oscar%'
LIMIT 10;

-- Expected: Should find all Oscars including Óscar

SELECT PLAYERNAME, POSITION, SQUADNAME
FROM players
WHERE NORMALIZE_TEXT_UDF(PLAYERNAME) ILIKE '%jose%'
LIMIT 10;

-- Expected: Should find all Joses including José

-- ============================================
-- TEST 6: Performance Check
-- ============================================
-- Check explain plan to see if query is efficient
EXPLAIN
SELECT * FROM players
WHERE NORMALIZE_TEXT_UDF(PLAYERNAME) ILIKE '%robert%';

-- Review the plan for full table scans
-- NOTE: UDF calls prevent index usage - consider adding normalized column for production

-- ============================================
-- TEST 7: Case Insensitivity with Accents
-- ============================================
SELECT
    NORMALIZE_TEXT_UDF('RÓBERT') = NORMALIZE_TEXT_UDF('robert') AS test_upper_to_lower,
    NORMALIZE_TEXT_UDF('róbert') = NORMALIZE_TEXT_UDF('ROBERT') AS test_lower_to_upper,
    NORMALIZE_TEXT_UDF('RóBeRt') = NORMALIZE_TEXT_UDF('robert') AS test_mixed_case;

-- Expected: All should return TRUE

-- ============================================
-- INSTRUCTIONS
-- ============================================
-- 1. Run each test section in order
-- 2. Verify all boolean tests return TRUE
-- 3. Check that real player searches find the expected results
-- 4. Review the EXPLAIN plan for performance concerns
-- 5. If all tests pass, proceed with implementation
-- 6. If any test fails, investigate Snowflake collation documentation
