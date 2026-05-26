-- Create NORMALIZE_TEXT_UDF in CAFC_DB.IMPECT_RAW
-- Run this once in Snowflake before using the CAFC_DB player/match search endpoints.
--
-- This function removes diacritical marks (accents) for accent-insensitive search.
-- Example: NORMALIZE_TEXT_UDF('Róbert') -> 'robert'
--
-- Steps:
--   1. Run this entire script in Snowflake (Worksheets or SnowSQL)
--   2. Grant usage to your app role if needed (see bottom of file)

USE DATABASE CAFC_DB;
USE SCHEMA IMPECT_RAW;

CREATE OR REPLACE FUNCTION NORMALIZE_TEXT_UDF(text VARCHAR)
RETURNS VARCHAR
LANGUAGE JAVASCRIPT
AS $$
  if (!TEXT) return '';

  // Normalize to NFD (decompose combined characters)
  // Then remove all combining diacritical marks (Unicode category Mn)
  var normalized = TEXT.normalize('NFD');
  var result = normalized.replace(/[\u0300-\u036f]/g, '');

  // Return lowercase for case-insensitive matching
  return result.toLowerCase();
$$;

-- Verify it works
SELECT
    NORMALIZE_TEXT_UDF('Róbert')   AS test_robert,
    NORMALIZE_TEXT_UDF('Boženík')  AS test_bozenik,
    NORMALIZE_TEXT_UDF('José')     AS test_jose,
    NORMALIZE_TEXT_UDF('Óscar')    AS test_oscar,
    NORMALIZE_TEXT_UDF('João')     AS test_joao;

-- Expected: robert | bozenik | jose | oscar | joao

-- Grant usage to your app roles (adjust role names as needed):
-- GRANT USAGE ON FUNCTION CAFC_DB.IMPECT_RAW.NORMALIZE_TEXT_UDF(VARCHAR) TO ROLE DEV_ROLE;
-- GRANT USAGE ON FUNCTION CAFC_DB.IMPECT_RAW.NORMALIZE_TEXT_UDF(VARCHAR) TO ROLE APP_ROLE;
