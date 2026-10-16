# Native player reads: production execution plan

Prepared 16 October 2026. **Nothing here has run in production.** Each stage
below needs Hashim's explicit go for that stage. RUNBOOK.md holds the installer
detail; this file is the concrete order, owners, checks and stop rules.

## What changes for users

Player search, profiles, report and list pages read players straight from the
clean CORE tables instead of the APP_COMPAT copy. Five duplicate players created
by the migration are marked inactive (nothing deleted). Everything else, including
how reports, lists, intel and recommendations are saved, stays as it is today.

## Before the window (no downtime)

| # | Step | Who | Done when |
|---|---|---|---|
| A1 | Merge CAFC-DS/cafc-data-platform#17 (persistent APP_ROLE grants) | Hashim | Merged. **Until then, do not run a prod dbt build**: it would drop the manual grants. |
| A2 | Prod dbt build of `core_player_current_context core_player_recent_position core_player_id_resolutions players_base players` via `python/orchestrator.py --target prod` (or `dbt build --select … --target prod`) | Hashim approves, Claude runs | `SHOW GRANTS` lists APP_ROLE SELECT on all three native sources after the rebuild. Also refreshes club/position data last built 30 Sept. |
| A3 | Push `codex/native-player-release-current`, open the app PR against `cutover/full`, review the diff against deployed 3db15bb | Claude opens, Hashim reviews | Live revision still 3db15bb, or the branch is reconciled and retested. |
| A4 | Deploy that build to `dependable-adventure` with `NATIVE_PLAYER_READS=false` | Hashim approves | Startup log shows APP_COMPAT reads, CORE writes; `/health/snowflake` = 1; a manual click-through of search, a profile, a report and a list works. |
| A5 | Agree the soak window (suggest 48 hours) and who watches it | Hashim | Recorded in readiness.json. |

A4 changes no behaviour: the switch is off, so this is the old read path on new code.

## The window (about 30 to 45 minutes; writes paused)

1. **Announce** a short read-only period to scouts and staff.
2. **Pause every writer** on Railway project cheerful-healing (production):
   `dependable-adventure` (user backend; scale to 0 or put in maintenance),
   `recruitment-email-worker`, `impect-backfill`, and the older
   `cafc-recruitment-platform` service until its consumers are confirmed.
   Confirm no orchestrator, matcher, merge.py or dbt run is in progress.
   Check: Snowflake `QUERY_HISTORY` shows no INSERT/UPDATE/MERGE on CORE for 5 minutes.
3. **Recovery point:** note the current time, and zero-copy clone CORE to
   `CORE_BACKUP_NATIVE_20261016` (or rely on Time Travel; confirm retention days first).
4. **Re-audit references** to the five retiring IDs across CORE, APP, MIGRATION and
   legacy PUBLIC (installer does this inside its transaction for CORE). Stop if any new reference appears.
5. **Run the installer**: `--prepare-ledger`, then apply, each with `--schema CORE
   --execute-production --writers-stopped` and a new release ID.
6. **Verify:** exactly five players inactive, ten resolver overrides added, no other
   player or identity row changed, `canonical_players.validate` passes.
7. **Rebuild the fallback** `players_base` with its dbt model, so falling back
   would not re-show the five retired players.
8. **Switch on** `NATIVE_PLAYER_READS=true` on `dependable-adventure` and restart it.
   Startup must not log "Native player reads blocked".
9. **Smoke test** as a real user: search with an accented name, two player profiles
   (one external, one manually added), a scout report, a list with flags, the
   recommendations page. No HTTP 5xx and no caught SQL errors in the logs.
10. **Resume writers** in order: email worker, then backfill/matcher. The next
    orchestrator run must finish green; re-run `validate` after it.

## Monitoring during the soak

- Railway `dependable-adventure`: HTTP 5xx rate and p95 response time against the
  same hours on the previous weekday; logs for "Native player reads blocked",
  Snowflake errors, and connection-pool growth (each new connection pays ~1.5s once).
- Snowflake: failed queries by APP_ROLE, and p95 elapsed time of queries over
  PLAYERS/PLAYER_IDENTITIES.
- Agreed bar: p95 under 1s for detail, report and list reads; search no slower
  than before; errors under 0.5%.

## Stop rules and rollback

Roll back reads if any of these hold for 10 minutes: 5xx or SQL error rate above
0.5%, detail/report/list p95 above 1s, or any "Native player reads blocked" log.

1. **Reads rollback (minutes, no data change):** set `NATIVE_PLAYER_READS=false`,
   restart `dependable-adventure`. The app reads APP_COMPAT exactly as today.
   The duplicate fix stays in place.
2. **Correction rollback (only if the fix itself is wrong):** keep native reads off,
   pause writers again, run the installer `--restore` with the same release ID,
   then rebuild `players_base`. The five duplicates reappear exactly as before.
3. **Full code rollback:** redeploy 3db15bb (the current production build).

Never roll back by deploying old default-ID writer code or disabling canonical
report/list writers, and never drop or replace tables as a rollback.

## Known gaps this release does not fix

- The agent-portal duplicate-player check was lost in the cutover merge (c45330e):
  deployed code accepts `confirm_new_player` but never checks for duplicates, so
  agent manual entries can create new duplicate players. Its 34 tests fail on the
  deployed build too. Separate fix recommended before or soon after this release.
- 71% of IMPECT identity rows repeat the same player and IMPECT ID once per season;
  this slows native lookups. Data clean-up for a later release.
- Report, list, intel and recommendation writers, manual team/position edits and
  APP_COMPAT retirement are later stages of the normalisation work.
