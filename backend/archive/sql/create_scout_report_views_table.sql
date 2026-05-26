-- Table to track which scout reports each user has viewed
-- This enables per-user unread markers on the Scouting page

CREATE TABLE SCOUT_REPORT_VIEWS (
  ID NUMBER AUTOINCREMENT PRIMARY KEY,
  SCOUT_REPORT_ID NUMBER NOT NULL,
  USER_ID NUMBER NOT NULL,
  VIEWED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  CONSTRAINT UQ_USER_REPORT UNIQUE (USER_ID, SCOUT_REPORT_ID)
);

-- Note: Snowflake uses automatic micro-partitioning for query optimization
-- No need to create explicit indexes on regular tables

-- Example usage:
-- Run this SQL in your Snowflake console to create the table before starting the backend
