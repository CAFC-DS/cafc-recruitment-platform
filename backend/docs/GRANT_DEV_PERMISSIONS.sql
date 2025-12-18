-- =====================================================================
-- Grant Permissions to DEV_ROLE for Development Access
-- =====================================================================
-- This script grants the DEV_ROLE role access to the RECRUITMENT_TEST
-- database and all its tables. Run this with an ACCOUNTADMIN account.
--
-- Usage:
--   1. Log into Snowflake with ACCOUNTADMIN privileges
--   2. Copy and paste these commands into a SQL worksheet
--   3. Execute all commands
-- =====================================================================

-- Switch to ACCOUNTADMIN role to grant permissions
USE ROLE ACCOUNTADMIN;

-- Grant database access to DEV_ROLE
GRANT USAGE ON DATABASE RECRUITMENT_TEST TO ROLE DEV_ROLE;

-- Grant schema access to DEV_ROLE
GRANT USAGE ON SCHEMA RECRUITMENT_TEST.PUBLIC TO ROLE DEV_ROLE;

-- Grant table permissions to DEV_ROLE
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA RECRUITMENT_TEST.PUBLIC TO ROLE DEV_ROLE;

-- Grant permissions on future tables (important for new tables created later)
GRANT SELECT, INSERT, UPDATE, DELETE ON FUTURE TABLES IN SCHEMA RECRUITMENT_TEST.PUBLIC TO ROLE DEV_ROLE;

-- Grant warehouse access (if not already granted)
GRANT USAGE ON WAREHOUSE DEVELOPMENT_WH TO ROLE DEV_ROLE;
GRANT OPERATE ON WAREHOUSE DEVELOPMENT_WH TO ROLE DEV_ROLE;

-- Grant role to HUMARJI user (if not already granted)
GRANT ROLE DEV_ROLE TO USER HUMARJI;

-- Verify the grants were applied
SHOW GRANTS TO ROLE DEV_ROLE;

-- =====================================================================
-- Verification Queries
-- =====================================================================
-- Run these to verify DEV_ROLE can access the tables:

USE ROLE DEV_ROLE;
USE WAREHOUSE DEVELOPMENT_WH;
USE DATABASE RECRUITMENT_TEST;
USE SCHEMA PUBLIC;

-- Test queries (should all work without errors)
SELECT COUNT(*) FROM USERS;
SELECT COUNT(*) FROM PLAYERS;
SELECT COUNT(*) FROM SCOUT_REPORTS;
SELECT COUNT(*) FROM PLAYER_INFORMATION;
SELECT COUNT(*) FROM PLAYER_NOTES;
SELECT COUNT(*) FROM MATCHES;

-- =====================================================================
-- SUCCESS!
-- =====================================================================
-- If all queries above run without errors, your permissions are set up
-- correctly and you can restart your backend.
-- =====================================================================
