# Verification — 7 October 2026

## CAFC_DB resubmission acceptance — 9 October 2026

- Applied the two-column and one-row mutex migration to CAFC_DB.CORE as DEV_ROLE;
  granted SELECT/UPDATE on the mutex to DEV_ROLE and APP_ROLE.
- Restarted the local backend with CAFC_DB.CORE connection/write configuration.
- Tested the real HTTP form endpoint against Snowflake with an injected agent
  identity and isolated temporary recommendations. Ownership and empty-change
  validation passed. Concurrent requests returned one 200 and one 409.
- Verified a new Submitted recommendation, preserved player identity, updated
  deal details, previous/next links, one creation-history entry and an untouched
  original. Repeated resubmission rejected. Removed both test rows and history;
  cleanup verified zero marked rows remain.
- This was API/database acceptance, not a real authenticated browser login test.
  Email tables, Graph transport and Railway deployment remain untouched.

## Resubmission follow-up — 8 October 2026

- Added a resubmission-only migration and independent release guide, so email
  services and credentials are not prerequisites.
- Older unlinked recommendations show a staff-linking explanation before the
  resubmission form; the backend already rejects these safely.
- Focused resubmission checks: 13 backend tests and 3 frontend tests pass.
- No database migration or deployment has been performed. Actual Snowflake
  concurrency and authenticated agent acceptance remain release checks.

## Local checks

- 52 new backend tests pass: transport safety/caching/throttling, digest windows/BST/rendering, agent ownership/eligibility/identity/lineage, admin batches, stale selections, transaction rollback, recipient separation, durable recovery and reviewed retry.
- 5 frontend flow tests pass: manual preview/test confirmation, selected NCUC IDs/default statuses, dirty preview invalidation, mandatory resubmission explanation and fixed player identity, latest-version eligibility.
- TypeScript typecheck passes.
- Production frontend build passes with the repository's existing lint warnings.
- New Python modules pass compile and undefined/unused-symbol checks.
- Full backend suite: 126 passed, 34 failed. All 34 failure names reproduce in an untouched `cutover/full` checkout. These are stale duplicate-intake tests and bare-table SQL assertions, not new regressions.

Commands (with project dependencies installed):

```sh
PYTHONPATH=backend pytest -q backend/tests/test_email_service.py backend/tests/test_weekly_digest.py backend/tests/test_agent_resubmission.py backend/tests/test_email_lifecycle_api.py
npm run typecheck --prefix frontend
CI=true npm test --prefix frontend -- --watchAll=false --runInBand --runTestsByPath src/pages/AdminEmailPage.test.tsx src/pages/agents/AgentResubmission.test.tsx
npm run build --prefix frontend
```

## Browser checks

Used the full frontend and an isolated SQLite test API with synthetic agent/player data, no Graph transport and no production connection. Verified individual preview, missing-email warning, general shared-address deduplication, redirected-test queue creation, NCUC selection preview, apply without email, two separate personalised agent notifications, and reopening a saved notification preview. The synthetic agents intentionally share an address to verify their player lists are never combined.

Agent resubmission rendering/navigation is covered by the frontend flow tests; ownership/status/identity and the actual form endpoint contract are covered by backend tests. Live authenticated agent/production database verification remains a release check.

## Read-only Snowflake checks

Checked the existing development configuration (`RECRUITMENT_TEST.PUBLIC`), without changing rows or applying migrations:

- PERFORMANCE_SCORE is NUMBER(5,2); stored ratings range from 1 to 10.
- CREATED_AT is TIMESTAMP_NTZ; IS_ARCHIVED is BOOLEAN.
- Current weekly window has zero qualifying reports in this development copy.
- Historical preview from 1 August through 5 October 2026: 274 qualifying reports, grouped into 239 players. An independent raw-report count query matches both totals.
- New lifecycle tables and recommendation columns are not yet installed.
- Calvin's staff account resolves to senior_manager with a CAFC email. Liam's staff account resolves to senior_manager with a personal Gmail address. Phil did not resolve in this development copy, including name variants/usernames/email aliases.

Production account/role/email checks are still required before configuring live digest recipients. No recipient addresses or credentials were added to committed configuration.

## Remaining release verification

Owner-run migrations and grants, Snowflake-specific concurrent requests/rollback tests, real Graph acceptance and inbox receipt, Sent Items/single-recipient verification, production profile links, agreed agent wording/date range and production recipient confirmation. No live emails, production recommendation changes, Railway deployments or production migrations were performed.

Railway service settings follow the official config-as-code reference: https://docs.railway.com/config-as-code/reference
