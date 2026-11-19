-- Keep manually maintained leagues on the permanent player record.
-- Apply before deploying the updated native player projection.
ALTER TABLE CAFC_DB.CORE.PLAYERS
    ADD COLUMN IF NOT EXISTS MANUAL_COMPETITION_NAME VARCHAR;
