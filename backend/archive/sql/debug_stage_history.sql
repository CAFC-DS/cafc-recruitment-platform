-- Debugging queries for player 174947 in AM list

-- 1. Check if the AM list exists
SELECT 'List Check' as CHECK_TYPE, ID, LIST_NAME
FROM PLAYER_LISTS
WHERE LIST_NAME = 'AM';

-- 2. Check if player 174947 is in ANY list
SELECT 'Player in Lists' as CHECK_TYPE,
    pli.ID as LIST_ITEM_ID,
    pl.LIST_NAME,
    pli.PLAYER_ID,
    pli.ADDED_BY,
    pli.CREATED_AT
FROM PLAYER_LIST_ITEMS pli
JOIN PLAYER_LISTS pl ON pli.LIST_ID = pl.ID
WHERE pli.PLAYER_ID = 174947;

-- 3. Check if player 174947 is specifically in the AM list
SELECT 'Player in AM List' as CHECK_TYPE,
    pli.ID as LIST_ITEM_ID,
    pli.LIST_ID,
    pl.LIST_NAME,
    pli.PLAYER_ID,
    pli.ADDED_BY,
    pli.CREATED_AT
FROM PLAYER_LIST_ITEMS pli
JOIN PLAYER_LISTS pl ON pli.LIST_ID = pl.ID
WHERE pli.PLAYER_ID = 174947
  AND pl.LIST_NAME = 'AM';

-- 4. Check if stage history already exists for player 174947
SELECT 'Existing Stage History' as CHECK_TYPE,
    psh.*
FROM PLAYER_STAGE_HISTORY psh
JOIN PLAYER_LIST_ITEMS pli ON psh.LIST_ITEM_ID = pli.ID
WHERE pli.PLAYER_ID = 174947;

-- 5. Check what the INSERT SELECT would return (without the NOT EXISTS check)
SELECT 'What Would Be Inserted' as CHECK_TYPE,
    pli.ID as LIST_ITEM_ID,
    pli.LIST_ID,
    pli.PLAYER_ID,
    NULL as OLD_STAGE,
    'Stage 2' as NEW_STAGE,
    'Flagged by Data' as REASON,
    'Initial entry' as DESCRIPTION,
    pli.ADDED_BY as CHANGED_BY,
    pli.CREATED_AT as CHANGED_AT
FROM PLAYER_LIST_ITEMS pli
JOIN PLAYER_LISTS pl ON pli.LIST_ID = pl.ID
WHERE pli.PLAYER_ID = 174947
  AND pl.LIST_NAME = 'AM';
