# Stage 5 rollout

Stage 5 follows Stage 4 across first-team, U21 and U18 shortlists. Stage 4 remains
available. Stage 5 uses purple badges. The agent portal's recommendation statuses
are independent and unchanged.

## Verification completed

- Frontend TypeScript check and production build.
- Focused regression tests for individual/bulk changes, history, counts,
  write permissions, migration preview, transaction commit and rollback.
- Read-only Snowflake audit on 19 October 2026: `CAFC_DB.CORE` has
  15 Stage 4 memberships, all `first_team`. The earlier legacy-table count of 26
  in `RECRUITMENT_TEST.PUBLIC` does not represent the production cohort.
  Recheck before migration; this count can change.

## Branch and attribution

- Base: production `cutover/full` at `31a7c3c` when this branch was created.
- Responsible user: Hashim Umarji, `humarji`, admin ID `301` (verified in `CAFC_DB.CORE.USERS`).
- The branch does not automatically run the migration on startup or merge.

## Release order

1. Deploy frontend and backend Stage 5 support before migrating live data.
2. Pause shortlist writes during the one-off migration.
3. Use the backend's correct deployed environment/credentials and run the preview:

   ```sh
   cd backend
   python tools/move_stage4_to_stage5.py
   ```

4. Apply with the target database/schema, refreshed count, and Hashim Umarji’s
   admin ID (301), as requested:

   ```sh
   python tools/move_stage4_to_stage5.py --apply --changed-by 301 \
     --expect-database CAFC_DB --expect-schema CORE --expect-count 15
   ```

   Attribution is validated against Hashim Umarji’s admin record. Environment
   configuration determines the connection. Target tables use the deployed
   application’s `core_table()` routing, and the expected target must match.
   The script uses one explicit transaction and rolls back if the count or
   membership stages change. It records every transition without rewriting old
   history and updates affected list timestamps. No schema change is needed.

5. Restart backend instances to clear process-local caches, then resume writes.
6. Verify Stage 4 is empty, Stage 5 gained the migrated memberships, list totals
   are unchanged, and each affected membership has one Stage 4 → Stage 5 event.
7. Check lists, Kanban (including horizontal scrolling), filters, pitch filtering,
   profiles, CSV export, stage history and analytics. Check a date before migration
   still shows the original Stage 4 occupancy.

## Analytics interpretation

Stage occupancy and cumulative presence now include Stage 5. Movement cards also
include 3 → 4, 4 → 5, and archiving from 4/5. Analytics remains first-team-only.
Migration events count as Stage 4 → Stage 5 moves on the migration date. A player
may appear in both Stage 4 and Stage 5 cumulative totals for the same date window.

## Recovery

Migration exceptions roll back the entire cohort, including inserted history.
After a committed migration, retain Stage 5 support until recovery is complete;
reverting the frontend first could hide Stage 5 memberships. A committed reversal
must target this migration's history records and only memberships that have not
subsequently changed stage. Record compensating 5 → 4 events; preserve history.
Do not rerun the migration after normal Stage 4 use resumes: it targets all current
Stage 4 memberships, including any newly entered ones.
