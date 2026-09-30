# Migration plan: moving the recruitment platform onto the normalized database

**Goal.** The recruitment platform reads and writes a properly normalized database (1NF/2NF/3NF, one canonical
key per player and fixture, no comma-joined lists, no copied agent facts), **without breaking anything that works
today**, one domain at a time, each step reversible.

**Not the goal.** A big-bang rewrite of `main.py`, or changing what the app returns to the frontend.

Companion documents: `RECRUITMENT_DB_AUDIT.md` (what is wrong, with counts), `DATA_MODEL_NORMALIZATION_PLAN.md`
(the target model and its rationale). Tooling: `backend/migrations/normalization/`, `backend/tools/`.

---

## 1. What we are working with (measured, not assumed)

| Fact | Value | Consequence |
|---|---|---|
| App-owned tables | 17, all physical tables in `CAFC_DB.CORE` | these are what get normalized |
| Read call sites in `main.py` | **251** (scout reports 103, users 46, list items 27, lists 20, intel 11, ...) | leave them untouched |
| Write call sites | **83** (28 insert/merge, 43 update, 12 delete) | these are what must change |
| Rows read by position (`row[N]`, N >= 10) | 170 | a replacement must match column **order** |
| Endpoints that apply `TRY_CAST` to columns | yes (found by rehearsal) | a replacement must match column **types** exactly |
| `APP_COMPAT` | dbt-built; `PLAYERS` and `MATCHES` are already legacy-shaped views over normalized canonical tables (103 app call sites); the other 17 are `select *` passthroughs the app does **not** read | this is the existing pattern (ADR 0001, "strangler fig") to extend |
| Snowflake views | **not writable** (no `INSTEAD OF` triggers, no updatable views) | writes must move to the normalized tables *before* any table becomes a view |
| Snowflake DDL | not transactional | every DDL step is ordered so the risky window is milliseconds, with a printed recovery command |

Reads outnumber writes 3 to 1, which decides the strategy: **keep every read working by making the old table
name a view over the normalized tables; change only the 83 write sites.**

## 2. Target architecture

```
                    BEFORE                                          AFTER (per domain)
  app reads  ──►  CORE.PLAYER_RECOMMENDATIONS (table)      app reads  ──►  CORE.PLAYER_RECOMMENDATIONS (VIEW, same name,
  app writes ──►  CORE.PLAYER_RECOMMENDATIONS (table)                        same 41 columns, order and TYPES)
                                                                              │  assembled from
                                                            app writes ──►  RECOMMENDATIONS + RECOMMENDATION_TERMS +
                                                                             4 junction tables + AGENT_PROFILES
                                                            (kept for rollback)  PLAYER_RECOMMENDATIONS_LEGACY (table)
```

Three layers, per domain:

1. **Normalized base tables** (new, in `CORE`) hold the truth. Constraints declared; validation queries enforce them
   (Snowflake does not enforce PK/FK on standard tables).
2. **Compatibility view under the legacy name** reproduces the legacy table exactly (`V_COMPAT_<TABLE>`, then the
   swap gives it the legacy name). The 251 read sites keep working unchanged.
3. **Legacy table kept as `<NAME>_LEGACY`** until the soak ends, so rollback is a rename, not a restore.

Where a legacy value cannot be derived from normalized data (a dangling `LINKED_UNIVERSAL_ID`, an agent's free-text
fee), the base table carries it as a clearly **DEPRECATED** column so the view stays byte-exact. Those columns are
dropped in the final contract phase.

## 3. The per-domain playbook

Every domain follows the same ten steps. Steps 1-4 are additive and touch nothing the app uses; the cutover
(steps 6-8) is a short window; steps 9-10 happen after a soak.

| # | Step | Reversible? | Gate to proceed |
|---|---|---|---|
| 1 | **Expand**: create normalized tables + lookups; backfill from legacy (`0xx` migrations, full recompute) | yes, drop the new objects | validation passes |
| 2 | **Build the compat view** (`V_COMPAT_*`), every column `CAST` to the live legacy type | yes | -- |
| 3 | **Parity**: `--parity` compares the view to the legacy table: row counts, column names/order, column **types**, and `EXCEPT` both ways (zero rows) | read-only | **must be clean** |
| 4 | **Endpoint diff**: run the app's real endpoints against a swapped clone and diff every response (`tools/verify_read_compat.py`) | read-only | **zero differences** |
| 5 | **Ship the new write path** behind a flag (default off): the domain's write sites write the normalized tables in one explicit transaction. Deploy with the flag off; behaviour is unchanged | flag off | tests pass; deploy healthy |
| 6 | **Freeze writes** for the domain (minutes), final re-sync, re-run parity | -- | parity clean |
| 7 | `--mark-cutover <domain>` then `--swap <domain> --apply`: legacy table renamed `*_LEGACY`, view takes the legacy name (the runner refuses unless the domain is marked cut over **and** parity is clean) | `--swap-rollback` copies data back and restores the name | swap reports success |
| 8 | **Flip the write flag on**, unfreeze | flag off + `--swap-rollback` | smoke test of every endpoint of the domain |
| 9 | **Soak** (agree the length per domain; suggest 2 weeks for scout reports, 1 for the rest): watch errors, run `--parity --legacy-suffix _LEGACY`, `cutover_compare` | -- | no regression |
| 10 | **Contract**: drop legacy columns / tables (`contract/<domain>.sql`), only after strict validation | one-way | signed off |

**Why one cutover window, not dual-writes.** Writing both the legacy table and the normalized tables from the app
would double the write logic in 83 places and, with the app's current transaction handling, could leave the two
inconsistent. Instead the legacy table is the source of truth until the freeze, and the normalized tables are the
source of truth after it; the compat view makes the switch invisible to readers.

## 4. What the rehearsal on a real clone proved, and what it caught

Rehearsed for recommendations (the smallest domain and the hardest to reconstruct) on a zero-copy clone of live
`CORE`; live `CORE` was never written. 

**Proved**
- The compat view reproduces all **596 rows x 41 columns** of `PLAYER_RECOMMENDATIONS` exactly (same order, same
  types), from the normalized tables, including the four comma-joined lists rebuilt in their original order.
- The swap works: the legacy name becomes a view, the legacy table is preserved, the notes-history foreign key is
  repointed, and a write to the swapped name is refused (which is why the write path must move first).
- The runner blocks a swap when the domain is not marked cut over, when parity fails, or when already swapped,
  and blocks a rollback when nothing is swapped. All are unit-tested with a fake cursor.

**Caught (each would have broken production, none is visible in the schema alone)**
1. **A row whose legacy columns disagree.** Recommendation 6402 stores `EXPECTED_WAGES = 13000` but
   `EXPECTED_WAGES_AMOUNT/MIN/MAX = 130000`. The edit path updated the new columns and not the old duplicate. One
   value must be chosen by the data owner **before** the real swap; parity stays red until then.
2. **Column types matter.** The app's SQL applies `TRY_CAST` to some wage columns; Snowflake rejects
   `TRY_CAST(NUMBER(18,0) ...)` where the legacy column is `NUMBER(38,0)`. A view with the right names and values
   still broke every recommendation endpoint. Fix: every view column is `CAST` to the live legacy type, and parity
   now compares types.
3. **Additive columns change `SELECT *`.** The expand migrations append columns to the legacy table, so `SELECT *`
   from it no longer has the original shape. The app never does that on these tables (verified), but the parity
   check and the rollback statement both had to use explicit column lists.
4. **Foreign keys follow a renamed table.** `RECOMMENDATION_NOTES_HISTORY -> PLAYER_RECOMMENDATIONS` would have
   followed the legacy table to `*_LEGACY`; the swap repoints it.
5. **Comma-list order.** Rebuilding `DM,CM` versus `CM,DM` exactly needs the original position stored, so each
   junction row keeps its `SEQ`.
6. **Wage basis is one value per recommendation**, not per term (it covers both wages); moved to the base table.
7. **A statement that fails mid-swap** cannot be rolled back (DDL). The swap now builds and validates the view under a
   temporary name first, does the two renames back to back, and the runner prints the exact recovery statement on
   failure.

**Endpoint diff on the real app code.** `tools/verify_read_compat.py` imports the real `backend/main.py` and calls the
recommendation endpoints directly against (a) the clone before the swap and (b) the clone after the swap: every filter
(status, position, deal type, age, fee range, salary range, name, dates, combined), every sort in both directions, the
unfiltered list paged to the end (all 596 rows appear), the list for the 6 busiest agents, filters metadata, the CSV
export, 50 detail ids (including 6402 and the first and last), and status/notes history for 41 ids.

| Result | Count |
|---|---|
| Endpoint calls compared | **213** |
| Byte-identical responses | **211** |
| Differed: filters metadata | 1: the same 184 agents with the same labels, reordered in 4 positions, all inside the two labels shared by two agent users. The app's query is `ORDER BY 2` with no tie-breaker, so tie order is unspecified; I did not observe the legacy query flip on repeat, so this is *consistent with* pre-existing nondeterminism, not proof of it |
| Differed: one agent's list | 1: an error in the swapped run only. Re-run alone on both schemas it returned 12 rows with **identical hashes**. Not reproduced; most likely contention from two heavy runs in parallel |

The first runs of this harness failed on **every** call, which is what found the `TRY_CAST` type mismatch (caught item 2
above). Caveat: row 6402's legacy `EXPECTED_WAGES` was aligned to its amount **in the clone only** so parity could pass;
the real value is a decision for the data owner.

**Rollback rehearsed.** A recommendation written through the normalized tables after the swap (with two positions and a
wage term) was visible through the legacy name as `CM,DM` with the agent's name from the profile; after
`--swap-rollback` it was present in the restored legacy table, the foreign key was restored, and the ledger read
`CUTOVER, SWAP, SWAPBACK, UNCUTOVER`. No write was lost.

## 5. Domain order and size

| Order | Domain | Tables | Read sites | Write sites | Why here |
|---|---|---|---|---|---|
| 0 | **Foundations** | -- | -- | -- | transaction helper (the app's `autocommit = False` does nothing on connector 3.7, so today's multi-statement writes are not atomic), write-path flags, a write freeze switch |
| 1 | **Recommendations + agents** | `PLAYER_RECOMMENDATIONS` (+ `AGENT_PROFILES.AGENCY_ID`) | 5 | 8 (create, agent edit, 4x status/notes, merge relink) | smallest surface, worst denormalization, users are agents and a few staff, not scouts: proves the pattern with low blast radius. **Rehearsed.** |
| 2 | **Intel** | `PLAYER_INFORMATION` | 11 | 3 | small; needs the deal-type vocabulary unified |
| 3 | **Sharing and views** | `SHARED_REPORT_LINKS`, `SCOUT_REPORT_VIEWS` | 7 | 5 | small; the delete-policy decision lands here |
| 4 | **Lists** | `PLAYER_LISTS`, `PLAYER_LIST_ITEMS`, `PLAYER_STAGE_HISTORY`, `PLAYER_LIST_FLAGS` | 59 | ~30 | Kanban and Emerging Talent depend on it; needs the stage lookup and the 44 mismatched history rows reconciled |
| 5 | **Scout reports** | `SCOUT_REPORTS`, `SCOUT_REPORT_ATTRIBUTE_SCORES` | 112 | 17 | the largest and most used (11,684 reports, all scouts). Last, when the pattern is boring. Introduces the canonical player/fixture keys; the legacy `PLAYER_ID` / `CAFC_PLAYER_ID` / `MATCH_ID` must be reproduced exactly by the view |
| 6 | **Users / roles** | `USERS` (+ `ROLES` lookup) | 46 | 12 | already 3NF; only the role vocabulary and delete cleanup change |
| P | **Platform data** (parallel, platform team) | `FIXTURES`, `FIXTURE_IDENTITIES`, `PLAYER_IDENTITIES`, `PLAYERS` | -- | -- | duplicate fixtures (230 IMPECT ids map to more than one) and multi-mapped identities corrupt every join; must be fixed before domain 5 relies on canonical keys |

Cross-cutting write sites that touch several domains and must be updated with the *first* domain that changes them:
`/admin/merge-players` (rewrites reports, list items, intel, flags, recommendations), `/admin/merge-duplicate-match`
(rewrites `MATCH_ID`), the request-time `ensure_*` / `ALTER TABLE` helpers, and the platform team's remap scripts.

## 6. App changes required

Reads: **none** for domains 1-6 (the compat view keeps the name).

Writes: per domain, replace each write site (line numbers as of this commit, from a scan of `core_table('<t>')`):

| Domain | Write sites in `backend/main.py` |
|---|---|
| Recommendations | 4021 (create), 4218, 4323, 4601, 4614, 4687, 4735, 6038 (merge relink) |
| Intel | 12651, 12867, 12918 |
| Sharing / views | 9978, 10064, 10339, 10380, 10465 |
| Lists | 1274, 5960-5997 (merge), 6014, 6022, 16865, 17636, 17664, 17955-19345 (about 20 sites), 18858 |
| Scout reports | 7064, 7075, 7699, 7735, 7814, 7973, 8026, 8179, 8214, 8224, 8272, 8277, 13778, 13787 |
| Users | 3445, 3562, 5176-5493, 8466, 13844-13965 |

Rules for the new write path (all domains):
- one explicit `BEGIN ... COMMIT` per request, `ROLLBACK` on any error, via a shared helper (the connector's
  `autocommit` attribute assignment is a no-op on 3.7);
- new ids from `AUTOINCREMENT`/sequence, fetched explicitly (no `ORDER BY CREATED_AT DESC LIMIT 1` read-back);
- the flag selects legacy or normalized writes; both paths ship in the same release so the flip needs no deploy.

## 7. Verification at every step

| Check | Tool | Meaning |
|---|---|---|
| Structure and value parity | `--parity` (`parity/*.sql`) | the view equals the legacy table: counts, names, order, **types**, `EXCEPT` both ways |
| Real-app read parity | `tools/verify_read_compat.py` | imports the real `main.py`, calls the domain's endpoints across filters, sorts, pages and every detail id, diffs the JSON before/after the swap |
| Write-path tests | pytest against a sandbox clone | each write site: happy path, rollback on failure, view reflects the write |
| Constraint checks | `--validate --strict` | orphans, duplicates, stale canonical keys |
| Regression net | `backend/tools/cutover_compare` | the platform team's existing harness |
| Unit tests | `pytest backend/tests` | 124 tests for the migration tooling today |

## 8. Rollback, at every stage

| Stage | Rollback | Data loss |
|---|---|---|
| Steps 1-5 | drop the new objects / flag off | none (the app never used them) |
| Step 7 fails | the runner prints the recovery `ALTER TABLE ... RENAME`; `--swap-rollback` | none |
| After the flip (8-9) | flag off, freeze, `--swap-rollback` (copies normalized rows **back** into the legacy table via the view, restores the name, un-marks the cutover), unfreeze | none (writes made after the swap are copied back) |
| After contract (10) | restore from the `CORE_PRE_NORMALIZATION` clone / Time Travel | writes since the snapshot |

## 9. Blockers to resolve before the first real swap

These need a person, not code:
1. **Recommendation 6402**: `EXPECTED_WAGES` 13,000 or 130,000?
2. **Delete policy**: keep history for deleted items/users/reports (drop the false foreign keys) or cascade (536 stage-history rows, 3,816 report-views for deleted users, 455 for deleted reports, 2 share links, 6 status-history rows, 10 score rows).
3. **Legacy agreement types** `Player Agreement/Mandate` (136 recommendations) and `Club Mandate` (1): keep, remap, or retire.
4. **Unresolved references**: 4 reports with an unknown player (+1 with a `CAFC_PLAYER_ID` not in `PLAYERS`), 37 reports whose `MATCH_ID` matches nothing, 5 list items, 29 recommendations.
5. **Freeze mechanism** for the cutover window (does the app have a maintenance mode, or is the window taken by pausing the frontend?).
6. **Soak length** and sign-off owner per domain.

## 10. Dependencies outside the app

- **dbt `APP_COMPAT` models** are the natural long-term home of the compat views (they already are for `PLAYERS`/`MATCHES`). This branch builds them as plain SQL views so they can be rehearsed; port to `dbt/models/app_compat/` in `cafc-data-platform` before the real swap so dbt does not overwrite them. The existing `select *` passthrough models over the swapped names keep working.
- `APP_ROLE` needs `SELECT/INSERT/UPDATE/DELETE` on the new base tables and `SELECT` on the views (`090_grants.sql`).
- Platform remap scripts and the duplicate-merge plan write the same tables; they must write the canonical columns from the moment their domain is swapped.
- Nothing outside the recruitment platform was considered (per scope).

## 11. Status of this branch

| Piece | State |
|---|---|
| Audit of the live tables | done (`RECRUITMENT_DB_AUDIT.md`) |
| Expand migrations `000-090`, validation, snapshot, grants | done; rehearsed on a clone; idempotent |
| **Recommendations: normalized tables, compat view, parity, swap, rollback** | **done and rehearsed on a clone; swap/rollback guarded and unit-tested** |
| Endpoint diff harness | done; result in section 4 |
| Recommendations write-path change in `main.py` (8 sites) + transaction helper + flag | **not started** (next) |
| Domains 2-6 (tables, compat views, swap scripts) | not started; the playbook is identical |
| Contract scripts | written for recommendations, intel, reports/lists; deferred pieces documented |
| Anything applied to live `CORE` | **nothing** |
