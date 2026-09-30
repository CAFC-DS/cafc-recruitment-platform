-- @sync-until-cutover: recommendations
-- 021_keys_recommendations.sql
-- LINKED_UNIVERSAL_ID ('internal_<CAFC id>' / 'external_<IMPECT id>', a composite packed into a
-- string) -> numeric LINKED_CANONICAL_PLAYER_ID. Full recompute until the recommendations domain
-- cuts over (the app rewrites LINKED_UNIVERSAL_ID in place on /admin/merge-players and on edit).
--
-- Named LINKED_CANONICAL_PLAYER_ID, not LINKED_CAFC_PLAYER_ID: build_recommendation_select()
-- already aliases a *derived* LINKED_CAFC_PLAYER_ID, so a real column of that name would clash
-- the first time anyone writes pr.*.

ALTER TABLE ${CORE}.PLAYER_RECOMMENDATIONS ADD COLUMN IF NOT EXISTS LINKED_CANONICAL_PLAYER_ID NUMBER(38,0);

CREATE OR REPLACE VIEW ${CORE}.V_RECOMMENDATION_KEYS AS
SELECT s.ID,
       CASE WHEN REGEXP_LIKE(s.LINKED_UNIVERSAL_ID, '^internal_[0-9]+$') THEN p.CAFC_PLAYER_ID
            WHEN REGEXP_LIKE(s.LINKED_UNIVERSAL_ID, '^external_[0-9]+$') THEN r.CAFC_PLAYER_ID END AS EXPECTED_PLAYER_ID
FROM ${CORE}.PLAYER_RECOMMENDATIONS s
LEFT JOIN ${CORE}.PLAYERS p
       ON p.CAFC_PLAYER_ID = TRY_TO_NUMBER(REGEXP_SUBSTR(s.LINKED_UNIVERSAL_ID, '^internal_([0-9]+)$', 1, 1, 'e', 1))
LEFT JOIN ${CORE}.CORE_PLAYER_ID_RESOLUTIONS r
       ON r.SOURCE_SYSTEM = 'IMPECT' AND r.SOURCE_PLAYER_ID = REGEXP_SUBSTR(s.LINKED_UNIVERSAL_ID, '^external_([0-9]+)$', 1, 1, 'e', 1);

UPDATE ${CORE}.PLAYER_RECOMMENDATIONS t
SET LINKED_CANONICAL_PLAYER_ID = k.EXPECTED_PLAYER_ID
FROM ${CORE}.V_RECOMMENDATION_KEYS k
WHERE t.ID = k.ID AND t.LINKED_CANONICAL_PLAYER_ID IS DISTINCT FROM k.EXPECTED_PLAYER_ID;
