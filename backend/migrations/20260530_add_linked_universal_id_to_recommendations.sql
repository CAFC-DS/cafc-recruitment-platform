-- Stores the resolved universal player id for an agent recommendation, so
-- internal staff views (and a future "Agent Intel" section on the player
-- profile) can link the recommendation to a player without relying on the
-- fuzzy NORMALIZE_TEXT_UDF() name match computed in build_recommendation_select().
--
-- Format: 'internal_<CAFC_PLAYER_ID>' for CAFC players, 'external_<PLAYERID>'
-- for everyone else. Populated at submission/edit time from
-- /agents/recommendations. Old rows keep NULL and continue to resolve via
-- the legacy fuzzy match (see build_recommendation_select()'s CASE block).

ALTER TABLE PLAYER_RECOMMENDATIONS ADD COLUMN IF NOT EXISTS LINKED_UNIVERSAL_ID VARCHAR;
