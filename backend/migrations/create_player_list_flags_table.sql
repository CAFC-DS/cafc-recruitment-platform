-- Shared favorite/decision markers for players on internal lists.
-- These are visible to everyone with list access (Admin/Senior Manager),
-- replacing the previous per-account (browser localStorage) behaviour.
-- Run this once with a role that has CREATE TABLE on the target schema (the
-- app role APP_ROLE does not, so the application does NOT create it at runtime).
CREATE TABLE IF NOT EXISTS PLAYER_LIST_FLAGS (
    UNIVERSAL_ID   VARCHAR(255) PRIMARY KEY,
    IS_FAVORITE    BOOLEAN DEFAULT FALSE,
    IS_DECISION    BOOLEAN DEFAULT FALSE,
    FAVORITED_BY   INTEGER,
    FAVORITED_AT   TIMESTAMP_NTZ,
    DECISION_BY    INTEGER,
    DECISION_AT    TIMESTAMP_NTZ,
    UPDATED_AT     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP
);
