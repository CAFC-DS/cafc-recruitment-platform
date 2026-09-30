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

-- Shared links must point at real users (CREATED_BY is a numeric user id).
SELECT 'shared link CREATED_BY is not a known user', SHARE_TOKEN, TO_VARCHAR(CREATED_BY), NULL
FROM ${CORE}.SHARED_REPORT_LINKS
WHERE CREATED_BY NOT IN (SELECT ID FROM ${CORE}.USERS);

-- Derived overall score vs sum of attribute rows (only reports that have attribute rows).
SELECT 'ATTRIBUTE_SCORE <> sum of attribute rows', TO_VARCHAR(sr.ID), TO_VARCHAR(sr.ATTRIBUTE_SCORE), TO_VARCHAR(s.TOTAL)
FROM ${CORE}.SCOUT_REPORTS sr
JOIN (SELECT SCOUT_REPORT_ID, SUM(ATTRIBUTE_SCORE) AS TOTAL
      FROM ${CORE}.SCOUT_REPORT_ATTRIBUTE_SCORES GROUP BY SCOUT_REPORT_ID) s ON s.SCOUT_REPORT_ID = sr.ID
WHERE sr.ATTRIBUTE_SCORE IS DISTINCT FROM s.TOTAL;

-- Pre-existing data defect (found on live data 2026-09-30, report 22801): child rows whose
-- parent report no longer exists. Not caused by the migration; clean up separately.
SELECT 'scout_report_attribute_scores orphan', s.SCOUT_REPORT_ID, COUNT(*)
FROM ${CORE}.SCOUT_REPORT_ATTRIBUTE_SCORES s
WHERE s.SCOUT_REPORT_ID NOT IN (SELECT ID FROM ${CORE}.SCOUT_REPORTS)
GROUP BY s.SCOUT_REPORT_ID;

-- Precondition for dropping the agent columns from PLAYER_RECOMMENDATIONS (contract): each must equal
-- the submitter's AGENT_PROFILES row. 0 of 596 differed on 2026-09-30. If this ever returns rows, the
-- recommendation holds a snapshot that would be lost by the drop.
SELECT 'recommendation agent facts differ from submitter profile' AS CHECK_NAME, TO_VARCHAR(r.ID) AS ROW_ID, NULL AS A, NULL AS B
FROM ${CORE}.PLAYER_RECOMMENDATIONS r
JOIN ${CORE}.AGENT_PROFILES p ON p.USER_ID = r.SUBMITTED_BY_USER_ID
WHERE LOWER(TRIM(r.AGENT_NAME))  IS DISTINCT FROM LOWER(TRIM(p.AGENT_NAME))
   OR LOWER(TRIM(r.AGENCY))      IS DISTINCT FROM LOWER(TRIM(p.AGENCY))
   OR LOWER(TRIM(r.AGENT_EMAIL)) IS DISTINCT FROM LOWER(TRIM(p.AGENT_EMAIL))
   OR TRIM(r.AGENT_NUMBER)       IS DISTINCT FROM TRIM(p.AGENT_NUMBER);
