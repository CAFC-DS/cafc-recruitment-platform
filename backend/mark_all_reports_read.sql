-- Mark all existing scout reports as "read" for all users
-- This should be run once after creating the SCOUT_REPORT_VIEWS table
-- to avoid showing all historical reports as unread

-- For Admin and Manager users - mark ALL reports as read
INSERT INTO SCOUT_REPORT_VIEWS (SCOUT_REPORT_ID, USER_ID, VIEWED_AT)
SELECT DISTINCT
    sr.ID as SCOUT_REPORT_ID,
    u.ID as USER_ID,
    CURRENT_TIMESTAMP() as VIEWED_AT
FROM SCOUT_REPORTS sr
CROSS JOIN USERS u
WHERE u.ROLE IN ('admin', 'manager')
AND NOT EXISTS (
    -- Don't insert duplicates
    SELECT 1 FROM SCOUT_REPORT_VIEWS srv
    WHERE srv.SCOUT_REPORT_ID = sr.ID AND srv.USER_ID = u.ID
);

-- For Scout users - mark only THEIR reports as read
INSERT INTO SCOUT_REPORT_VIEWS (SCOUT_REPORT_ID, USER_ID, VIEWED_AT)
SELECT DISTINCT
    sr.ID as SCOUT_REPORT_ID,
    sr.USER_ID as USER_ID,
    CURRENT_TIMESTAMP() as VIEWED_AT
FROM SCOUT_REPORTS sr
JOIN USERS u ON sr.USER_ID = u.ID
WHERE u.ROLE = 'scout'
AND NOT EXISTS (
    -- Don't insert duplicates
    SELECT 1 FROM SCOUT_REPORT_VIEWS srv
    WHERE srv.SCOUT_REPORT_ID = sr.ID AND srv.USER_ID = sr.USER_ID
);

-- For Loan users - mark their own reports AND all loan reports as read
INSERT INTO SCOUT_REPORT_VIEWS (SCOUT_REPORT_ID, USER_ID, VIEWED_AT)
SELECT DISTINCT
    sr.ID as SCOUT_REPORT_ID,
    u.ID as USER_ID,
    CURRENT_TIMESTAMP() as VIEWED_AT
FROM SCOUT_REPORTS sr
CROSS JOIN USERS u
WHERE u.ROLE = 'loan'
AND (
    sr.USER_ID = u.ID  -- Their own reports
    OR UPPER(sr.PURPOSE) = UPPER('Loan Report')  -- All loan reports
)
AND NOT EXISTS (
    -- Don't insert duplicates
    SELECT 1 FROM SCOUT_REPORT_VIEWS srv
    WHERE srv.SCOUT_REPORT_ID = sr.ID AND srv.USER_ID = u.ID
);

-- Verify the results
SELECT
    u.ROLE,
    COUNT(DISTINCT srv.USER_ID) as num_users,
    COUNT(*) as total_view_records
FROM SCOUT_REPORT_VIEWS srv
JOIN USERS u ON srv.USER_ID = u.ID
GROUP BY u.ROLE
ORDER BY u.ROLE;
