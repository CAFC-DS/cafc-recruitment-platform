-- Snowflake COLLATE Testing Script
-- Run these queries in Snowflake console to verify accent-insensitive behavior
-- Expected: All tests should return TRUE
-- Collation: 'en-ci-ai' = English, Case Insensitive, Accent Insensitive

-- ============================================
-- TEST 1: Basic Accent-Insensitive Equality
-- ============================================
SELECT
    'Róbert' COLLATE 'en-ci-ai' = 'Robert' AS test_robert,
    'Boženík' COLLATE 'en-ci-ai' = 'Bozenik' AS test_bozenik,
    'José' COLLATE 'en-ci-ai' = 'Jose' AS test_jose,
    'Óscar' COLLATE 'en-ci-ai' = 'Oscar' AS test_oscar,
    'Márton' COLLATE 'en-ci-ai' = 'Marton' AS test_marton,
    'João' COLLATE 'en-ci-ai' = 'Joao' AS test_joao;

-- Expected: All columns should return TRUE

-- ============================================
-- TEST 2: ILIKE Pattern Matching
-- ============================================
SELECT
    'Róbert Boženík' COLLATE 'en-ci-ai' ILIKE '%Robert%' AS test1,
    'Róbert Boženík' COLLATE 'en-ci-ai' ILIKE '%Bozenik%' AS test2,
    'Róbert Boženík' COLLATE 'en-ci-ai' ILIKE '%robert bozenik%' AS test3,
    'José Óscar' COLLATE 'en-ci-ai' ILIKE '%Jose Oscar%' AS test4;

-- Expected: All should return TRUE

-- ============================================
-- TEST 3: Real Player Search (if Robert Bozenik exists)
-- ============================================
SELECT PLAYERNAME, POSITION, SQUADNAME
FROM players
WHERE PLAYERNAME COLLATE 'en-ci-ai' ILIKE '%Robert Bozenik%'
LIMIT 10;

-- Expected: Should find "Róbert Boženík"

-- ============================================
-- TEST 4: Search for Various Accented Names
-- ============================================
SELECT PLAYERNAME, POSITION, SQUADNAME
FROM players
WHERE PLAYERNAME COLLATE 'en-ci-ai' ILIKE '%Oscar%'
LIMIT 10;

-- Expected: Should find all Oscars including Óscar

SELECT PLAYERNAME, POSITION, SQUADNAME
FROM players
WHERE PLAYERNAME COLLATE 'en-ci-ai' ILIKE '%Jose%'
LIMIT 10;

-- Expected: Should find all Joses including José

-- ============================================
-- TEST 5: Performance Check
-- ============================================
-- Check explain plan to see if query is efficient
EXPLAIN
SELECT * FROM players
WHERE PLAYERNAME COLLATE 'en-ci-ai' ILIKE '%Robert%';

-- Review the plan for any full table scans or inefficiencies

-- ============================================
-- TEST 6: Case Insensitivity with Accents
-- ============================================
SELECT
    'RÓBERT' COLLATE 'en-ci-ai' = 'robert' AS test_upper_to_lower,
    'róbert' COLLATE 'en-ci-ai' = 'ROBERT' AS test_lower_to_upper,
    'RóBeRt' COLLATE 'en-ci-ai' = 'robert' AS test_mixed_case;

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
