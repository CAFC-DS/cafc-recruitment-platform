-- Single-use, expiring password reset tokens for admin-generated reset links.
-- The application also creates this table lazily (CREATE TABLE IF NOT EXISTS) via
-- ensure_password_reset_tokens_table() in main.py; this file documents the schema
-- and lets it be applied as part of the normal migration set.
--
-- Security notes:
--   * TOKEN_HASH stores a SHA-256 hex digest of the raw token, never the token
--     itself, so a read of this table cannot be used to reset a password.
--   * Tokens are single-use (USED_AT set on consumption) and time-limited
--     (EXPIRES_AT = issue time + 24h). IS_ACTIVE is set FALSE on use or when a
--     newer link supersedes an unused one.
CREATE TABLE IF NOT EXISTS PASSWORD_RESET_TOKENS (
    ID           INTEGER AUTOINCREMENT,
    USER_ID      INTEGER       NOT NULL,
    TOKEN_HASH   VARCHAR(64)   NOT NULL,
    EXPIRES_AT   TIMESTAMP_NTZ NOT NULL,
    USED_AT      TIMESTAMP_NTZ,
    IS_ACTIVE    BOOLEAN DEFAULT TRUE,
    CREATED_BY   INTEGER,
    CREATED_AT   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP
);
