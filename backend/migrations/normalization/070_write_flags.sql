-- 070_write_flags.sql
-- One row per migration domain: does the app write the NORMALIZED tables (TRUE) or the LEGACY table (FALSE)?
-- Read by backend/write_path.py (WriteFlags). Every domain starts FALSE, and the app treats a missing table,
-- missing row or any error as FALSE, so nothing changes until a swap script flips a flag.
--
-- Insert-only: re-running this migration can never flip a flag that the swap scripts have set.
-- The swap scripts set the flag in the same run that swaps the table for a view (and rollback clears it), so the
-- table and the flag cannot drift apart.

CREATE TABLE IF NOT EXISTS ${CORE}.APP_WRITE_FLAGS (
    DOMAIN            VARCHAR(50)  NOT NULL,
    NORMALIZED_WRITES BOOLEAN      NOT NULL,
    UPDATED_AT        TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    UPDATED_BY        VARCHAR(255)  DEFAULT CURRENT_USER(),
    CONSTRAINT PK_APP_WRITE_FLAGS PRIMARY KEY (DOMAIN)
);

MERGE INTO ${CORE}.APP_WRITE_FLAGS t
USING (
    SELECT column1 AS DOMAIN FROM VALUES
        ('recommendations'), ('intel'), ('sharing'), ('lists'), ('reports'), ('users')
) s ON t.DOMAIN = s.DOMAIN
WHEN NOT MATCHED THEN INSERT (DOMAIN, NORMALIZED_WRITES) VALUES (s.DOMAIN, FALSE);

GRANT SELECT ON ${CORE}.APP_WRITE_FLAGS TO ROLE APP_ROLE;
GRANT SELECT ON ${CORE}.APP_WRITE_FLAGS TO ROLE DEV_ROLE;
