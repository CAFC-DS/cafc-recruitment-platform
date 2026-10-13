-- Resubmission-only release: no Graph credentials or email tables required.
-- Run as the schema owner after selecting the canonical database/schema used by
-- the API (CANONICAL_DB / CORE_DB_SCHEMA). Never target an APP_COMPAT view.
-- Apply once while recommendation/status writers are stopped.
ALTER TABLE PLAYER_RECOMMENDATIONS ADD COLUMN IF NOT EXISTS PREVIOUS_RECOMMENDATION_ID NUMBER;
ALTER TABLE PLAYER_RECOMMENDATIONS ADD COLUMN IF NOT EXISTS RESUBMISSION_CHANGES VARCHAR;

-- Standard Snowflake UNIQUE constraints are not enforced. The single seeded row
-- serializes concurrent resubmissions and staff status changes across processes.
CREATE TABLE IF NOT EXISTS LIFECYCLE_MUTEX (ID NUMBER NOT NULL, REVISION NUMBER NOT NULL);
MERGE INTO LIFECYCLE_MUTEX t USING (SELECT 1 ID) s ON t.ID=s.ID
WHEN NOT MATCHED THEN INSERT (ID, REVISION) VALUES (1, 0);

-- As owner, grant SELECT and UPDATE on LIFECYCLE_MUTEX to the API's actual role.
-- Keep existing PLAYER_RECOMMENDATIONS / STATUS_HISTORY write privileges.
-- Verify exactly one mutex row (ID=1), then restart the API's schema cache.
SELECT ID, COUNT(*) AS ROW_COUNT FROM LIFECYCLE_MUTEX GROUP BY ID;
