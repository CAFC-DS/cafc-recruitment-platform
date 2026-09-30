-- Orphans in the sharing/views tables. Informational until `--cleanup sharing` has run; a hard requirement under --strict
-- (the cutover and contract gate). Delete policy: rows that depend on a deleted report go with it; rows about a deleted
-- user are archived, not dropped.

SELECT 'scout_report_views for a deleted report' AS CHECK_NAME, COUNT(*) AS N
FROM ${CORE}.SCOUT_REPORT_VIEWS
WHERE SCOUT_REPORT_ID NOT IN (SELECT ID FROM ${CORE}.SCOUT_REPORTS)
HAVING COUNT(*) > 0;

SELECT 'scout_report_views for a deleted user', COUNT(*)
FROM ${CORE}.SCOUT_REPORT_VIEWS
WHERE USER_ID NOT IN (SELECT ID FROM ${CORE}.USERS)
HAVING COUNT(*) > 0;

SELECT 'shared_report_links for a deleted report', COUNT(*)
FROM ${CORE}.SHARED_REPORT_LINKS
WHERE REPORT_ID NOT IN (SELECT ID FROM ${CORE}.SCOUT_REPORTS)
HAVING COUNT(*) > 0;

SELECT 'shared_report_links created by a deleted user', COUNT(*)
FROM ${CORE}.SHARED_REPORT_LINKS
WHERE CREATED_BY NOT IN (SELECT ID FROM ${CORE}.USERS)
HAVING COUNT(*) > 0;
