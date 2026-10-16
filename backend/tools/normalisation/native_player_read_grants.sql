-- Reviewed proposal, not applied. No schema-wide or write privileges added.
-- APP_ROLE read probe on 2026-10-10 verified all other projection sources,
-- the identity resolver, CORE search UDF and COMPUTE_WH access.
-- These two materialized dbt summary tables are the missing privileges.
GRANT SELECT ON TABLE CAFC_DB.CORE.CORE_PLAYER_CURRENT_CONTEXT TO ROLE APP_ROLE;
GRANT SELECT ON TABLE CAFC_DB.CORE.CORE_PLAYER_RECENT_POSITION TO ROLE APP_ROLE;

-- Include the equivalent grants in dbt's persistent grant configuration;
-- a one-time grant is insufficient if a subsequent rebuild replaces a table.
-- Re-run the actual APP_ROLE probe with secondary roles disabled after applying.
