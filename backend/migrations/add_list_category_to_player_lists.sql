-- Migration: add LIST_CATEGORY to player_lists (Emerging Talent shortlists)
--
-- Adds a category so the original position lists (first_team) are cleanly
-- separated from the new emerging-talent U21/U18 shortlists, which reuse the
-- same position LIST_NAMEs.
--
-- PRIVILEGES: player_lists is owned by ACCOUNTADMIN; the DEV/APP roles only have
-- DML (no MODIFY). Run this as a role that has MODIFY on the table (e.g.
-- ACCOUNTADMIN). Additive and safe; revert with `ALTER TABLE player_lists DROP
-- COLUMN LIST_CATEGORY;`.

ALTER TABLE player_lists
  ADD COLUMN IF NOT EXISTS LIST_CATEGORY VARCHAR(50) DEFAULT 'first_team';

-- Snowflake's column DEFAULT only applies to new inserts, so backfill existing
-- rows (all current lists are first-team position lists).
UPDATE player_lists
  SET LIST_CATEGORY = 'first_team'
  WHERE LIST_CATEGORY IS NULL;

-- Sanity check (optional):
-- SELECT LIST_CATEGORY, COUNT(*) FROM player_lists GROUP BY 1;
