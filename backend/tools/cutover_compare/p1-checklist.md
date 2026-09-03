# P1.5 — manual per-role click-through (dry run)

Backend running **flipped** at `CAFC_DB.APP_DRYRUN` (see README.md step 2).
Do the full pass as a user of **every** role. After each **write**, confirm the
row landed in `CAFC_DB.APP_DRYRUN.<table>` (query Snowflake) and the app shows it,
and that `RECRUITMENT_TEST.PUBLIC` (or the legacy clone) did **not** change.

Log every error, wrong result, missing data, or slow path in
`../../../cafc-data-platform/docs/cutover/p1-findings.md`. Zero open items there
is a P2 gate condition.

Roles: `admin`, `senior_manager`, `manager`, `loan_manager`, `scout`,
`intel_reviewer`, `agent` (external portal).

## Every role — reads
- [ ] Log in (proves `users` table + auth on the clone).
- [ ] Player search returns results; try an accented name (proves `NORMALIZE_TEXT_UDF`).
- [ ] Open a player profile — bio, stats, scout reports, notes all render.
- [ ] Open a scout report detail.
- [ ] Lists / Kanban page loads; favourite/decision flags show.
- [ ] Recommendations list loads (whichever the role can see).
- [ ] Chatbot answers one question (proves `services/sql_generator.py` seam).
- [ ] `intel_reviewer`: sees intel + external/internal recs only, nothing else.
- [ ] `agent`: sees only their own portal (recommendations they submitted).

## Write-capable roles (admin / senior_manager / manager / loan_manager / scout, per your matrix)
- [ ] Create a scout report → row in `APP_DRYRUN.SCOUT_REPORTS` + attribute scores.
- [ ] Edit that scout report → row updated in place.
- [ ] Delete that scout report → gone, attribute scores + views gone.
- [ ] Add a player to a list → row in `APP_DRYRUN.PLAYER_LIST_ITEMS`.
- [ ] Move a list item between Kanban stages → `PLAYER_STAGE_HISTORY` row appended.
- [ ] Toggle a favourite / decision flag → `PLAYER_LIST_FLAGS` upsert.
- [ ] Remove the list item.
- [ ] Add a player note → row in `APP_DRYRUN.PLAYER_NOTES`.
- [ ] Create a recommendation → row in `APP_DRYRUN.PLAYER_RECOMMENDATIONS`.
- [ ] Update the recommendation status → row updated.
- [ ] Add player intel (`player_information`) → row written.
- [ ] Generate a shared report link → `SHARED_REPORT_LINKS` row; open the link.

## Admin only
- [ ] **Add Player** (manual/internal) → row in `APP_DRYRUN.PLAYERS`,
      `DATA_SOURCE='internal'`; **the new `CAFC_PLAYER_ID` is strictly greater than
      `MAX(CAFC_PLAYER_ID)` in the table before the insert** (proves `MANUAL_PLAYER_SEQ`
      carried its value over and didn't restart at 1 → no silent id collision); searchable.
- [ ] **Add Match** (manual/internal) → row in `APP_DRYRUN.MATCHES`,
      `DATA_SOURCE='internal'`; **the new `CAFC_MATCH_ID` is strictly greater than
      `MAX(CAFC_MATCH_ID)` in the table before the insert** (same check for `MANUAL_MATCH_SEQ`).
- [ ] Create a user → row in `APP_DRYRUN.USERS`; that user can log in.
- [ ] Trigger a password reset → `PASSWORD_RESET_TOKENS` row; reset link works.
- [ ] `merge-players` on two throwaway rows → loser removed, refs repointed.
- [ ] `delete-duplicate` on a throwaway player/match with no reports.
- [ ] `GET /database/metadata` → returns populated `players_table` / `matches_table`
      counts (proves the `main.py:14126` `CURRENT_SCHEMA()` fix).
- [ ] Startup log shows a `CREATE TABLE IF NOT EXISTS` no-op with no permission error
      (proves `APP_ROLE` owns the schema / runtime DDL works).

## Agent-intake path
- [ ] As `agent`, submit a recommendation for a **new** player (typeahead → "add new")
      → `_create_external_player_from_agent_intake` writes `APP_DRYRUN.PLAYERS`
      (`DATA_SOURCE='external'`), recommendation created.

## Cross-checks
- [ ] `diff.py --a base --b flip` clean across all 7 roles (P1.4).
- [ ] Pipelines (P1.6): run **locally** —
      `SNOWFLAKE_DATABASE=CAFC_DB SNOWFLAKE_SCHEMA=APP_DRYRUN SNOWFLAKE_ROLE=DEV_ROLE
      python src/download_players.py` and `... python download.py` — do **not** touch the
      GitHub repo secrets yet (that's P3.7). `PLAYERS`/`MATCHES` upserted with no error;
      `download-matches` staging tables create+drop cleanly; `DATA_SOURCE='manual'` /
      `'internal'` row counts unchanged.
- [ ] After P1: `DROP SCHEMA CAFC_DB.APP_DRYRUN;` so nothing lingers (the real
      `CAFC_DB.APP` is created fresh at P3.2).
