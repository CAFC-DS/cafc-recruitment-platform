-- Snowflake COLLATE Testing Script
-- Run these queries in Snowflake console to verify accent-insensitive behavior
-- Expected: All tests should return TRUE

-- ============================================
-- TEST 1: Basic Accent-Insensitive Equality
-- ============================================
SELECT
    'Róbert' COLLATE 'utf8-ai' = 'Robert' AS test_robert,
    'Boženík' COLLATE 'utf8-ai' = 'Bozenik' AS test_bozenik,
    'José' COLLATE 'utf8-ai' = 'Jose' AS test_jose,
    'Óscar' COLLATE 'utf8-ai' = 'Oscar' AS test_oscar,
    'Márton' COLLATE 'utf8-ai' = 'Marton' AS test_marton,
    'João' COLLATE 'utf8-ai' = 'Joao' AS test_joao;

-- Expected: All columns should return TRUE

-- ============================================
-- TEST 2: ILIKE Pattern Matching
-- ============================================
SELECT
    'Róbert Boženík' COLLATE 'utf8-ai' ILIKE '%Robert%' AS test1,
    'Róbert Boženík' COLLATE 'utf8-ai' ILIKE '%Bozenik%' AS test2,
    'Róbert Boženík' COLLATE 'utf8-ai' ILIKE '%robert bozenik%' AS test3,
    'José Óscar' COLLATE 'utf8-ai' ILIKE '%Jose Oscar%' AS test4;

-- Expected: All should return TRUE

-- ============================================
-- TEST 3: Real Player Search (if Robert Bozenik exists)
-- ============================================
SELECT PLAYERNAME, POSITION, SQUADNAME
FROM players
WHERE PLAYERNAME COLLATE 'utf8-ai' ILIKE '%Robert Bozenik%'
LIMIT 10;

-- Expected: Should find "Róbert Boženík"

-- ============================================
-- TEST 4: Search for Various Accented Names
-- ============================================
SELECT PLAYERNAME, POSITION, SQUADNAME
FROM players
WHERE PLAYERNAME COLLATE 'utf8-ai' ILIKE '%Oscar%'
LIMIT 10;

-- Expected: Should find all Oscars including Óscar

SELECT PLAYERNAME, POSITION, SQUADNAME
FROM players
WHERE PLAYERNAME COLLATE 'utf8-ai' ILIKE '%Jose%'
LIMIT 10;

-- Expected: Should find all Joses including José

-- ============================================
-- TEST 5: Performance Check
-- ============================================
-- Check explain plan to see if query is efficient
EXPLAIN
SELECT * FROM players
WHERE PLAYERNAME COLLATE 'utf8-ai' ILIKE '%Robert%';

-- Review the plan for any full table scans or inefficiencies

-- ============================================
-- TEST 6: Case Insensitivity with Accents
-- ============================================
SELECT
    'RÓBERT' COLLATE 'utf8-ai' = 'robert' AS test_upper_to_lower,
    'róbert' COLLATE 'utf8-ai' = 'ROBERT' AS test_lower_to_upper,
    'RóBeRt' COLLATE 'utf8-ai' = 'robert' AS test_mixed_case;

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
