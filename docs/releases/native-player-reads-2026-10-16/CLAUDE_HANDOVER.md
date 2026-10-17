# CAFC database normalisation — handover to Claude

Last verified: 16 October 2026. Re-check live deployment versions before acting.

## The user's intent

Make CAFC_DB a clean, normalised database with consistent application reads and
writes, while preserving scout reports, intel, player lists and historical links.
Provide an understandable architecture map showing schemas, tables, relationships
and user flows. Establish which Snowflake tables are useful or obsolete, complete
and verify the migration, then consider deletion. Do not delete tables simply
because the application no longer references them in one code path.

The user wants continued implementation with clear progress, isolated branches,
real testing and preservation of newer work. Avoid repeatedly asking permission
for already authorised preparation and reversible isolated work. Production
activation is still a separate outstanding approval gate.

## Current position

The immediate release is deliberately narrower than the whole normalisation
programme: native player reads plus five exact duplicate-player corrections.
It is implemented on top of the deployed code and rehearsed on fresh clones.
It has **not been deployed or activated**. The five production duplicate players
remain active. No production player data has been changed by this work.

**Production permissions HAVE changed:** the user explicitly authorised two
SELECT grants on 16 October. Both were applied and verified. Do not report that
production is completely unchanged or that these grants are still missing.

The next work is making those grants persistent in the owning dbt deployment,
then conducting concurrent performance tests with agreed acceptance limits.

## Repositories, branches and revisions

Application repository: CAFC-DS/cafc-recruitment-platform.

Current isolated release worktree:
`/tmp/cafc-native-player-release-current`

Branch: `codex/native-player-release-current`.
Latest work commit before this handover: `3902201`.
Important commits:

- `bf8c08b`: reconciled native player release and versioned correction/rollback.
- `eeee212`: published frontend and runtime-routing verification.
- `f6cee72`: user-confirmed production database/schema.
- `3902201`: applied production read grants and matching-principal verification.

The branch is based on deployed revision
`3db15bb03693b2edcaa99c8aa4c62ed1969fb1ae` from cutover/full. Its newer email,
agent lifecycle and performance changes were preserved. An AST comparison showed
only the eight intended existing application functions changed, plus one new
metadata helper. No existing branch was merged by this reconciliation.

Older, broader migration implementation:
`/Users/hashim.umarji/.codex/worktrees/cafc-normalisation/NewRecruitmentPlatform`
branch `codex/cafc-normalisation-implementation`, latest `9e801e0`.
This contains earlier canonical report/list and normalised intel/recommendation
writer work. **Those writer changes were not all ported into this narrower
release. Do not deploy the old branch over current production.**

Data-platform repository:
`/Users/hashim.umarji/Projects/cafc-data-platform`
branch last inspected: `cutover/full-platform`, revision `67c2fbe`.
The user's checkout has unrelated dirty ingestion work; preserve it.
Persistent-grant change exists as commit `e409872` on
`codex/native-player-read-grants`. Its former worktree
`/tmp/cafc-native-player-grants` is now missing/prunable. The commit and bundled
patch remain available. Recreate an isolated checkout from the current platform
revision; do not overwrite the user's files.

The user's desktop application checkouts may also be dirty. Inspect AGENTS.md,
Git status and current refs before changes. Do not reset or clean their checkouts.
Temporary worktrees may be cleaned externally: verify paths exist and recover
from the named branches/commits if necessary. Work is committed locally; remote
publication of these release branches has not been verified.

## Verified live architecture

Public frontend: https://cafc-recruitment-platform.vercel.app
Published JavaScript explicitly configures Axios to use:
https://dependable-adventure-production.up.railway.app
This was verified in the served bundle, not inferred from the source fallback.

Vercel project: `prj_TY3IVEaH57FJZgieqvQGkVDCaCvH`.
Team: `team_O5EFHoLeKkT2AnJ0xdFDiQO8`.
Production-target deployment inspected: `dpl_qnPfTKvHpWyjQLZrVWg1Bgq92DmS`,
revision `3fcbb6fe1a5db1471378b929f8f8d1bcfd6f71c2`.
Cutover/full preview inspected: `dpl_QkhJVdjFLBUypnpfEJyi6NWx6e14`,
revision `3db15bb03693b2edcaa99c8aa4c62ed1969fb1ae`.
Do not assume the newest preview is the production alias.

Railway project cheerful-healing: `82e7339a-d297-4a54-9242-4ed4fa8a4d24`.
Production environment: `7eb08858-913e-4559-8b04-8cc7ed4869e9`.

| Service | ID | Purpose/source |
|---|---|---|
| dependable-adventure | def6cce8-e07c-4e19-bdd1-1067c287286b | User-facing backend, cutover/full |
| recruitment-email-worker | 36106f93-1bbf-4edd-adf9-ed4c25a7c113 | Email worker, cutover/full |
| impect-backfill | beab60c7-7083-4a37-b60d-4e98b152426b | Data platform, cutover/full-platform |
| cafc-recruitment-platform | 050e1627-482b-415f-92b5-fe46600bb257 | Older backend, main; other consumers unverified |

Current backend deployment inspected:
`b8ba0b81-e22c-48ce-b395-404cc1de0c48`, SUCCESS, revision 3db15bb.
Configured backend replica count: one, europe-west4.
Startup logs confirmed production, APP_ROLE, COMPUTE_WH,
READ_PREFIX=CAFC_DB.APP_COMPAT, WRITE_PREFIX=CAFC_DB.CORE.
The user confirmed Railway variables:
SNOWFLAKE_PROD_DATABASE=CAFC_DB and SNOWFLAKE_PROD_SCHEMA=CORE.
The existing /health/snowflake endpoint returned success/result 1.

Therefore player creation is already configured for canonical CORE storage,
while player reads still use compatibility objects. Current deployed code does
not contain this release's NATIVE_PLAYER_READS switch or all earlier canonical
report/list writer infrastructure. Native reads remain unactivated.

## What the narrow release implements

- `backend/canonical_players.py`: a native projection preserving the existing
  15-column player contract, internal/external IDs and selected provider identities.
- `NATIVE_PLAYER_READS`, default false: routes players/players_base through that
  projection; validates target, identities and duplicate join keys on connections.
- Reads PLAYERS, PLAYER_IDENTITIES, CORE_PLAYER_CURRENT_CONTEXT and
  CORE_PLAYER_RECENT_POSITION; validation also uses CORE_PLAYER_ID_RESOLUTIONS.
- Preserves immediate visibility of canonical personal details and active status.
  Club/position summaries still depend on dbt refresh freshness.
- Fixes recommendation lookups that previously triggered caught Snowflake internal
  errors: native reads use a grouped join rather than repeated correlated lookups.
- Stable ID tie-breakers for same-name search pagination.
- Optional squad-change lookup checks for table existence before describing it.
- Preserves current CORE recommendation/lifecycle schema metadata routing.

Manual team/position persistence, remaining shared flags/history, optional chatbot
generated SQL and compatibility-table retirement are separate work. This release
does not certify that every application SQL path is normalised.

## The five exact duplicate corrections

| Extra record to retire | Existing record to retain | IMPECT provider IDs |
|---:|---:|---|
| 1354027 | 1329814 | 106165, 109214 |
| 1282585 | 1246662 | 208906, 209081 |
| 1365024 | 1297062 | 115086, 234837 |
| 1350827 | 1275591 | 106166, 115335 |
| 1299064 | 1289281 | 222391, 248285 |

These are migration-created duplicate records with equal profiles and identity
context bags, not speculative merges of similarly named trialists. Existing
resolver choices already point to the retained records. The refreshed live audit
passed across 59 reference columns in CORE, APP, MIGRATION and legacy PUBLIC.
It found no relevant live references to the retiring IDs outside preserved
player/identity records. Repeat under the actual writer pause before execution.

Correction inserts overrides pinning the ten current provider choices and marks
only the five extra players inactive. It deletes no player/identity rows and
repoints no existing historical references. The preserved duplicate identity
records were 49 of 98 affected identity rows in the original audit.

## Versioned production-capable installer

`backend/tools/normalisation/player_duplicate_release.py`:

- Exact reviewed pairs and ten-provider-ID gate.
- CORE requires explicit --execute-production; otherwise isolated
  CORE_DEV_CODEX_* targets only.
- Requires --writers-stopped, an operator attestation, not automatic pause detection.
- Ledger preparation is separate DDL; apply/restore are DML transactions.
- Records same-schema baseline/post-state in PLAYER_DUPLICATE_RELEASE_LEDGER
  atomically with correction changes.
- Failure rollback, idempotent apply/restore, override ownership checks and drift
  rejection. Restored release IDs cannot be reused for a new application.
- No grants, deployments, app flags, writer pauses or compatibility rebuilds.

Externally serialize installers: Snowflake standard-table uniqueness does not
provide a competing-installer lock. Pause/drain every writer and matcher first.
Restore requires native reads disabled; restoring the five active duplicates
reinstates the original native activation conflict.

The older reconcile_player_duplicates.py still refuses production mutations;
use it for audits and isolated tests. Do not bypass its schema guard.

## Production grants: completed, persistence pending

Applied with explicit user authorisation:

GRANT SELECT ON TABLE CAFC_DB.CORE.CORE_PLAYER_CURRENT_CONTEXT TO ROLE APP_ROLE;
GRANT SELECT ON TABLE CAFC_DB.CORE.CORE_PLAYER_RECENT_POSITION TO ROLE APP_ROLE;

Query IDs: 01c7c464-0004-6fe3-0002-73ee02a06b16 and
01c7c464-0004-6fe3-0002-73ee02a06b1a.

A separate connection using existing production credentials matched the
application username in Railway startup logs. It confirmed APP_ROLE,
COMPUTE_WH, CAFC_DB.CORE with secondary roles disabled. Actual reads passed on
all five native sources/resolver and the accent-search UDF. This verifies the
application principal's privileges; it is not a native-read HTTP test on the
running backend, which still runs the older build.

Persistent dbt patch, commit e409872, adds production-only SELECT grants to:

- dbt/models/canonical/dimensions/core_player_current_context.sql
- dbt/models/canonical/dimensions/core_player_recent_position.sql

Configuration: grants={'select': ['APP_ROLE']} if target.name == 'prod' else {}.
Offline dbt parsing passed for prod/dev on the earlier patch. No production dbt
build or deployment ran. Reconcile with current owning models and preserve grants
on subsequent rebuilds; one-time live grants alone do not close this gate.

## Verification and its limits

On the reconciled application:

- Backend default suite: 181 passed, 34 failed, 6 skipped.
- Clean deployed baseline: 146 passed, the exact same 34 failure identifiers.
  No new failures, but the suite is not green; review existing failures for impact.
- 20 API comparisons: identical HTTP 200 JSON, zero hidden/caught SQL errors.
  Includes scout report detail/rendered/feed, player profiles under several roles,
  search, filters, lists/memberships, leagues and competition filtering.
- Complete current recommendation result: all 604 rows/columns match, including
  newer lifecycle fields. The earlier 597-row figure is historical.
- Exact full player-row parity apart from the five planned retirements.
- Final installer run: 4 tests passed, including fresh-clone transaction rehearsal
  for injected failure, repeat application, ownership refusal, recorded restoration,
  repeat restoration and new-ID reapplication.

Fresh clones retained as evidence:
- CORE_DEV_CODEX_RELEASE_4C384B343DA8: first installer/API comparison clone.
- Final installer clone: read installer-rehearsal.json for its exact schema.

The first API run lacked the legacy compatibility MATCHES contract used by
current scout endpoints. Added a frozen APP_COMPAT.MATCHES copy only in the
isolated setup and reran successfully. No fixture migration was slipped into
production code to make tests pass.

API tests override authentication; they do not prove browser/login flows.
Performance timings are three-query samples on a development warehouse, not
concurrent production p95. Several native joins were slower. No concurrency,
p95, regression or soak acceptance budget has been agreed; do not declare
performance acceptance or production readiness.

## Next actions, in order

1. Re-read the current release documents and check Git/live versions have not
   advanced. Preserve current work; no wholesale old-branch merge or force reset.
2. Reconcile e409872's two persistent dbt grants onto the current data-platform
   branch in isolation. Review/test the diff and owning deployment process. Keep
   write/model rebuild scope narrow; do not casually run broad production dbt builds.
3. Prepare/run representative bounded concurrent read tests on an isolated clone.
   Record old/native p50/p95/p99, errors, concurrency, cache/warehouse state and
   duration. Agree numeric acceptance limits before calling the result acceptable.
4. Verify compatibility fallback freshness, review the 34 baseline failures and
   establish monitoring/rollback ownership. Confirm any actual-login smoke-test
   fixture rather than inventing credentials or altering real user reports.
5. Update manifest/readiness and present the concrete production execution plan.
   Production activation/correction approval remains open. Do not infer it from
   prior authorisation of only the two SELECT grants.
6. When approved, pause/drain all writers, repeat live dependency audit, capture
   recovery evidence, run installer, verify exact changes, enable native reads,
   resume/catch up writers and observe the agreed soak window.

Never delete tables or retire APP_COMPAT during this release. Never disable
canonical report/list writers or deploy old default-ID writers as a rollback
shortcut: sequence allocation requires separate reconciliation.

## Files and commands to start with

Within /tmp/cafc-native-player-release-current:

- docs/releases/native-player-reads-2026-10-16/RUNBOOK.md
- docs/releases/native-player-reads-2026-10-16/VERIFICATION.md
- docs/releases/native-player-reads-2026-10-16/RUNTIME_ROUTING.md
- docs/releases/native-player-reads-2026-10-16/READ_PERMISSIONS.md
- docs/releases/native-player-reads-2026-10-16/readiness.json
- docs/releases/native-player-reads-2026-10-16/manifest.json
- backend/tools/normalisation/test-results/2026-10-16/
- backend/tools/normalisation/test-results/2026-10-10/platform-native-player-grants.patch

Python used: /opt/anaconda3/bin/python3.10.

Safe package check:

    python backend/tools/normalisation/check_release_package.py
    python backend/tools/normalisation/check_release_package.py --require-ready

The first should pass integrity; --require-ready currently exits nonzero because
production gates remain open. This is expected, not permission to bypass gates.

Default tests:

    python -m pytest backend/tests -q -p no:cacheprovider

Live database tests need explicit CAFC_PLAYER_TEST_ENV_FILE. Read their fixtures
before running: they create isolated schemas and perform clone-only mutations.
prepare_player_read_rehearsal.py freezes the compatibility MATCHES shape, and
verify_player_read_release.py compares 20 APIs plus the full recommendation feed.

Existing private credential file, if authorised and still available:
/Users/hashim.umarji/Desktop/CAFC/2025-26/Recruitment/Coding/NewRecruitmentPlatform/backend/.env
Do not print or copy its values, credentials or keys into handover artifacts.
Railway OAuth exposes names rather than values; never treat redacted values as
missing or recreate secrets. Current database/schema were confirmed by the user.

## Architecture visuals already created

Under:
/Users/hashim.umarji/.codex/visualizations/2026/10/08/01a11a9f-ca78-7240-8ab7-28a79285f681

Files: cafc-architecture-canvas.html, cafc-database-map.html,
cafc-schema-explorer.html. They were created earlier and may be stale relative
to subsequent releases. Verify before updating or presenting them as current.
The user strongly prefers a readable, zoomable/pannable architecture overview
with schemas, tables and actual read/write flows.
