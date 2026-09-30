-- Informational: redundancy the contract phase will remove. Must be zero rows before the
-- corresponding columns are dropped, otherwise the drop discards information.

-- 3NF-7: cached current status must equal the latest STATUS_HISTORY row.
SELECT 'recommendation STATUS <> latest STATUS_HISTORY' AS CHECK_NAME, TO_VARCHAR(pr.ID) AS ROW_ID, pr.STATUS AS VALUE, h.NEW_STATUS AS EXPECTED
FROM ${CORE}.PLAYER_RECOMMENDATIONS pr
JOIN (
    SELECT RECOMMENDATION_ID, NEW_STATUS
    FROM ${CORE}.STATUS_HISTORY
    QUALIFY ROW_NUMBER() OVER (PARTITION BY RECOMMENDATION_ID ORDER BY CHANGED_AT DESC NULLS LAST, ID DESC) = 1
) h ON h.RECOMMENDATION_ID = pr.ID
WHERE pr.STATUS IS DISTINCT FROM h.NEW_STATUS;

-- 3NF-5: stage history LIST_ID / PLAYER_ID must agree with the list item they hang off.
SELECT 'stage history LIST_ID disagrees with item', TO_VARCHAR(psh.ID), TO_VARCHAR(psh.LIST_ID), TO_VARCHAR(li.LIST_ID)
FROM ${CORE}.PLAYER_STAGE_HISTORY psh
JOIN ${CORE}.PLAYER_LIST_ITEMS li ON li.ID = psh.LIST_ITEM_ID
WHERE psh.LIST_ID IS DISTINCT FROM li.LIST_ID;

-- 3NF-6: CREATED_BY is declared VARCHAR but the app writes an integer user id.
SELECT 'shared link CREATED_BY is not a user id', SHARE_TOKEN, CREATED_BY, NULL
FROM ${CORE}.SHARED_REPORT_LINKS
WHERE TRY_TO_NUMBER(TO_VARCHAR(CREATED_BY)) IS NULL
   OR TRY_TO_NUMBER(TO_VARCHAR(CREATED_BY)) NOT IN (SELECT ID FROM ${CORE}.USERS);

-- Derived overall score vs sum of attribute rows (only reports that have attribute rows).
SELECT 'ATTRIBUTE_SCORE <> sum of attribute rows', TO_VARCHAR(sr.ID), TO_VARCHAR(sr.ATTRIBUTE_SCORE), TO_VARCHAR(s.TOTAL)
FROM ${CORE}.SCOUT_REPORTS sr
JOIN (SELECT SCOUT_REPORT_ID, SUM(ATTRIBUTE_SCORE) AS TOTAL
      FROM ${CORE}.SCOUT_REPORT_ATTRIBUTE_SCORES GROUP BY SCOUT_REPORT_ID) s ON s.SCOUT_REPORT_ID = sr.ID
WHERE sr.ATTRIBUTE_SCORE IS DISTINCT FROM s.TOTAL;
