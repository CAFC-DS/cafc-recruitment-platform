# Native player read permissions — applied 16 October 2026

The user explicitly authorised applying the two prepared SELECT grants.

- CAFC_DB.CORE.CORE_PLAYER_CURRENT_CONTEXT → APP_ROLE SELECT
- CAFC_DB.CORE.CORE_PLAYER_RECENT_POSITION → APP_ROLE SELECT

Both statements succeeded; query IDs are saved in applied-read-permissions.json.
No broader grants, write permissions, player records or application flags changed.

Verification opened a separate connection with existing production credentials
whose username matched the current Railway deployment startup log. The session
confirmed APP_ROLE, COMPUTE_WH, CAFC_DB and CORE, with secondary roles disabled.
Actual COUNT reads passed on PLAYERS, PLAYER_IDENTITIES, both summary tables and
CORE_PLAYER_ID_RESOLUTIONS. The accent-search UDF also passed. This verifies
privileges for the deployed application's Snowflake principal; it is not an
HTTP native-read test on the running backend, whose switch remains unchanged.

Persistent dbt grants remain a separate deployment prerequisite. The reviewed
patch/commit e409872 configures these two models for production grants, but has
not been merged or deployed by this work. The previous temporary platform
worktree is no longer present; its commit and bundled patch remain available.
Until the owning dbt deployment includes that configuration and a subsequent
rebuild retains SELECT, the combined persistent-grant gate stays open.

Next: concurrent-read performance measurement with an approved acceptance budget,
and review/deployment of the persistent dbt configuration. Duplicate correction
and native-read activation still require the reviewed maintenance procedure.
