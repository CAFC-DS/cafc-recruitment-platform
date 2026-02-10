-- Check Database Context for UDF Creation
-- Run these queries in Snowflake to determine where to create the UDF

-- 1. Check where the 'players' table is located
SHOW TABLES LIKE 'players';
-- Look at the database_name and schema_name columns

-- 2. Check your current database/schema context
SELECT CURRENT_DATABASE() as current_db, CURRENT_SCHEMA() as current_schema;

-- 3. Check if NORMALIZE_TEXT_UDF already exists (and where)
SHOW USER FUNCTIONS LIKE 'NORMALIZE_TEXT_UDF';

-- 4. Switch to the correct database and schema (update these values based on step 1)
-- USE DATABASE your_database_name;
-- USE SCHEMA your_schema_name;

-- 5. Now create the UDF by running create_normalize_udf.sql

-- 6. Verify the UDF was created successfully
SELECT NORMALIZE_TEXT_UDF('Róbert Boženík') as test;
-- Expected: "robert bozenik"
