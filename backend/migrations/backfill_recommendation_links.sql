-- Backfill NULL LINKED_UNIVERSAL_ID values in player_recommendations
-- by matching player names to existing players in the players table

-- Step 1: Update recommendations that match internal players (CAFC_PLAYER_ID)
MERGE INTO player_recommendations AS pr
USING (
    SELECT
        pr.ID as rec_id,
        MIN(p.CAFC_PLAYER_ID) as matched_cafc_id
    FROM player_recommendations pr
    INNER JOIN players p
        ON NORMALIZE_TEXT_UDF(p.PLAYERNAME) = NORMALIZE_TEXT_UDF(pr.PLAYER_NAME)
        AND p.CAFC_PLAYER_ID IS NOT NULL
    WHERE pr.LINKED_UNIVERSAL_ID IS NULL
    GROUP BY pr.ID
) AS matches
ON pr.ID = matches.rec_id
WHEN MATCHED THEN
    UPDATE SET
        LINKED_UNIVERSAL_ID = CONCAT('internal_', matches.matched_cafc_id),
        UPDATED_AT = CURRENT_TIMESTAMP();

-- Step 2: Update recommendations that match external players (PLAYERID)
-- Only for players that weren't matched in Step 1
MERGE INTO player_recommendations AS pr
USING (
    SELECT
        pr.ID as rec_id,
        MIN(p.PLAYERID) as matched_player_id
    FROM player_recommendations pr
    INNER JOIN players p
        ON NORMALIZE_TEXT_UDF(p.PLAYERNAME) = NORMALIZE_TEXT_UDF(pr.PLAYER_NAME)
        AND p.PLAYERID IS NOT NULL
        AND p.CAFC_PLAYER_ID IS NULL  -- External players only
    WHERE pr.LINKED_UNIVERSAL_ID IS NULL
    GROUP BY pr.ID
) AS matches
ON pr.ID = matches.rec_id
WHEN MATCHED THEN
    UPDATE SET
        LINKED_UNIVERSAL_ID = CONCAT('external_', matches.matched_player_id),
        UPDATED_AT = CURRENT_TIMESTAMP();

-- Step 3: Check results
SELECT
    'Updated recommendations' as status,
    COUNT(*) as count
FROM player_recommendations
WHERE LINKED_UNIVERSAL_ID IS NOT NULL

UNION ALL

SELECT
    'Still NULL (no match found)' as status,
    COUNT(*) as count
FROM player_recommendations
WHERE LINKED_UNIVERSAL_ID IS NULL;

-- Step 4: Show sample of remaining NULL recommendations
SELECT
    ID,
    PLAYER_NAME,
    RECOMMENDED_POSITION,
    CREATED_AT
FROM player_recommendations
WHERE LINKED_UNIVERSAL_ID IS NULL
ORDER BY CREATED_AT DESC
LIMIT 20;
