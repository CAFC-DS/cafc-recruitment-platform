-- cleanup/sharing.sql   DESTRUCTIVE - run only with `--cleanup sharing --apply`, after the snapshot (000) exists.
--
-- Delete policy (owner's decision): when a scout report / intel report / similar is deleted, what hangs off it is deleted
-- too. Information about a USER is kept somewhere. Applied to the sharing tables:
--   * views of a report that no longer exists       -> deleted (they describe nothing)
--   * share links of a report that no longer exists -> deleted (the link opens nothing)
--   * views by a user that no longer exists         -> ARCHIVED in ARCHIVED_SCOUT_REPORT_VIEWS, then removed from the live table
--   * share links created by a missing user         -> ARCHIVED in ARCHIVED_SHARED_REPORT_LINKS, then removed
-- Live counts when written (2026-09-30): 455 views of deleted reports, 3,816 views by deleted users, 2 links of deleted
-- reports, 0 links by missing users. One transaction; nothing is removed that was not first archived or judged dependent.

CREATE TABLE IF NOT EXISTS ${CORE}.ARCHIVED_SCOUT_REPORT_VIEWS (
    ID NUMBER(38,0), SCOUT_REPORT_ID NUMBER(38,0), USER_ID NUMBER(38,0), VIEWED_AT TIMESTAMP_NTZ,
    ARCHIVED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(), ARCHIVE_REASON VARCHAR
);

CREATE TABLE IF NOT EXISTS ${CORE}.ARCHIVED_SHARED_REPORT_LINKS (
    ID NUMBER(38,0), REPORT_ID NUMBER(38,0), SHARE_TOKEN VARCHAR(255), CREATED_BY NUMBER(38,0),
    CREATED_AT TIMESTAMP_NTZ, EXPIRES_AT TIMESTAMP_NTZ, ACCESS_COUNT NUMBER(38,0), LAST_ACCESSED TIMESTAMP_NTZ,
    IS_ACTIVE BOOLEAN,
    ARCHIVED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(), ARCHIVE_REASON VARCHAR
);

BEGIN;

-- Dependents of a deleted report go first, whoever the user was.
DELETE FROM ${CORE}.SCOUT_REPORT_VIEWS
WHERE SCOUT_REPORT_ID NOT IN (SELECT ID FROM ${CORE}.SCOUT_REPORTS);

DELETE FROM ${CORE}.SHARED_REPORT_LINKS
WHERE REPORT_ID NOT IN (SELECT ID FROM ${CORE}.SCOUT_REPORTS);

-- What is left and belongs to a missing user is kept in the archive tables.
INSERT INTO ${CORE}.ARCHIVED_SCOUT_REPORT_VIEWS (ID, SCOUT_REPORT_ID, USER_ID, VIEWED_AT, ARCHIVE_REASON)
SELECT ID, SCOUT_REPORT_ID, USER_ID, VIEWED_AT, 'user no longer exists'
FROM ${CORE}.SCOUT_REPORT_VIEWS
WHERE USER_ID NOT IN (SELECT ID FROM ${CORE}.USERS)
  AND ID NOT IN (SELECT ID FROM ${CORE}.ARCHIVED_SCOUT_REPORT_VIEWS);

DELETE FROM ${CORE}.SCOUT_REPORT_VIEWS
WHERE USER_ID NOT IN (SELECT ID FROM ${CORE}.USERS)
  AND ID IN (SELECT ID FROM ${CORE}.ARCHIVED_SCOUT_REPORT_VIEWS);

INSERT INTO ${CORE}.ARCHIVED_SHARED_REPORT_LINKS
    (ID, REPORT_ID, SHARE_TOKEN, CREATED_BY, CREATED_AT, EXPIRES_AT, ACCESS_COUNT, LAST_ACCESSED, IS_ACTIVE, ARCHIVE_REASON)
SELECT ID, REPORT_ID, SHARE_TOKEN, CREATED_BY, CREATED_AT, EXPIRES_AT, ACCESS_COUNT, LAST_ACCESSED, IS_ACTIVE,
       'creating user no longer exists'
FROM ${CORE}.SHARED_REPORT_LINKS
WHERE CREATED_BY NOT IN (SELECT ID FROM ${CORE}.USERS)
  AND ID NOT IN (SELECT ID FROM ${CORE}.ARCHIVED_SHARED_REPORT_LINKS);

DELETE FROM ${CORE}.SHARED_REPORT_LINKS
WHERE CREATED_BY NOT IN (SELECT ID FROM ${CORE}.USERS)
  AND ID IN (SELECT ID FROM ${CORE}.ARCHIVED_SHARED_REPORT_LINKS);

COMMIT;
