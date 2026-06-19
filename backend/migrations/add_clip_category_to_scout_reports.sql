-- Migration: add CLIP_CATEGORY to scout_reports
--
-- Gives Clip reports a sentiment (Positive / Neutral / Negative), the clip
-- equivalent of a Flag's FLAG_CATEGORY. Kept as a separate column so flag
-- analytics and the archived-grade display logic are unaffected.
--
-- PRIVILEGES: scout_reports is admin-owned (like player_lists); the DEV/APP
-- roles only have DML, not MODIFY. Run this as a role with MODIFY on the table
-- (e.g. ACCOUNTADMIN). Additive and safe; revert with
-- `ALTER TABLE scout_reports DROP COLUMN CLIP_CATEGORY;`.

ALTER TABLE scout_reports
  ADD COLUMN IF NOT EXISTS CLIP_CATEGORY VARCHAR(50);

-- Sanity check (optional):
-- SELECT COUNT(*) FROM scout_reports WHERE CLIP_CATEGORY IS NOT NULL;
