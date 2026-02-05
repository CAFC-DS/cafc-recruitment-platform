-- Grant permissions on NORMALIZE_TEXT_UDF to application roles
-- This is required after creating the UDF so that DEV_ROLE and APP_ROLE can use it

-- Make sure you're in the correct database
USE DATABASE RECRUITMENT_TEST;
USE SCHEMA PUBLIC;

-- Grant USAGE permission to DEV_ROLE (development/local testing)
GRANT USAGE ON FUNCTION RECRUITMENT_TEST.PUBLIC.NORMALIZE_TEXT_UDF(VARCHAR) TO ROLE DEV_ROLE;

-- Grant USAGE permission to APP_ROLE (production application)
GRANT USAGE ON FUNCTION RECRUITMENT_TEST.PUBLIC.NORMALIZE_TEXT_UDF(VARCHAR) TO ROLE APP_ROLE;

-- Verify the grants were successful
SHOW GRANTS ON FUNCTION RECRUITMENT_TEST.PUBLIC.NORMALIZE_TEXT_UDF(VARCHAR);

-- Expected output should show both DEV_ROLE and APP_ROLE with USAGE privilege

-- Test that the function works with your role
SELECT NORMALIZE_TEXT_UDF('Róbert Boženík') as test;
-- Expected: "robert bozenik"
