# Data model normalization & Snowflake migration plan

Status: **Phases 0–3 implemented and rehearsed on a zero-copy clone of live `CORE` (`CAFC_DB.CORE_DEV_NORMALIZATION`): applied, idempotent, hard validation passes. NOT applied to live `CORE`. Phases 4–6 are plan only.**
Owner: recruitment platform · Branch: `claude/compassionate-carson-7g4wi1`

> **How this was produced.** The first draft was written from code because the Snowflake MCP
> connector was down. A direct connector session (key-pair, `DEV_ROLE`) was then used to `DESCRIBE`
> every table, profile the real values, and rehearse the migrations on a clone. That corrected the
> draft (see the migrations README): `SHARE_URL` does not exist, intel deal types use a different
> vocabulary from recommendations, intel `PLAYER_ID` is an IMPECT id even when `DATA_SOURCE` is NULL,
> and `Stage 4` / the legacy flag grades are real values. Live `CORE` was only ever read.

---

## 1. What the platform does with Snowflake today (short version)

Snowflake is both the analytical store (`CAFC_DB.CORE` canonical players,
fixtures, KPIs; `IMPECT_RAW`) **and** the transactional store for the app
(users, scout reports, lists, Kanban stage moves, recommendations, intel,
share links). The app-owned tables were cloned as-is from the legacy
`RECRUITMENT_TEST.PUBLIC` schema into `CAFC_DB.CORE` (Phases 3–4 of the cutover),
so they still carry the legacy denormalized design. The backend talks to them with
~400 inline `cursor.execute` calls.

## 2. Normalization audit of the app-owned tables

Scope rule: a lookup table only earns its place when something *depends on* the
code (it has its own attributes, it drives authorization/workflow, or the value
is multi-valued). Pure one-column enums with no dependents (e.g. `WAGE_BASIS`
Gross/Net, `REFERENCE_RATING`) already satisfy 3NF; they stay as validated text.

### 2.1 First normal form (atomic values, no repeating groups)

| # | Where | Violation | Fix |
|---|---|---|---|
| 1NF-1 | `PLAYER_RECOMMENDATIONS.POTENTIAL_DEAL_TYPE`, `PLAYER_INFORMATION.POTENTIAL_DEAL_TYPE` | Comma-joined list (`",".join(deal_types)`, `main.py:12512`) | Junction tables `RECOMMENDATION_DEAL_TYPES`, `INTEL_DEAL_TYPES` → `DEAL_TYPES` |
| 1NF-2 | `PLAYER_INFORMATION.RELATIONSHIP_TO_PLAYER` | Comma-joined list (`main.py:12517`) | Junction `INTEL_RELATIONSHIPS` → `RELATIONSHIP_TYPES` |
| 1NF-3 | `PLAYER_RECOMMENDATIONS` | Repeating column groups `TRANSFER_FEE_*`, `CURRENT_WAGES_*`, `EXPECTED_WAGES_*` (amount/min/max/currency) plus legacy free-text `TRANSFER_FEE`/`CURRENT_WAGES`/`EXPECTED_WAGES` carrying the same fact | Child table `RECOMMENDATION_TERMS` (one row per term type) |
| 1NF-4 | `PLAYER_INFORMATION` | Same wage/fee repeating group | `INTEL_TERMS` |
| 1NF-5 | `PLAYER_RECOMMENDATIONS.LINKED_UNIVERSAL_ID`, `PLAYER_LIST_FLAGS.UNIVERSAL_ID` | Composite value packed in a string (`internal_123` / `external_456` = source + id) | Numeric `LINKED_CANONICAL_PLAYER_ID` / `CAFC_PLAYER_ID` |
| 1NF-6 | `SCOUT_REPORTS.PLAYER_ID` / `CAFC_PLAYER_ID` (+ `MATCH_ID`) | One entity referenced by two mutually-exclusive columns, selected by `DATA_SOURCE` branching | Single `CANONICAL_PLAYER_ID` / `CANONICAL_FIXTURE_ID` |

### 2.2 Second normal form (no partial dependency on a composite key)

Almost every app table has a single-column surrogate key, so 2NF is satisfied
vacuously. The composite-keyed/child tables were checked individually:

| Table | Finding |
|---|---|
| `SCOUT_REPORT_ATTRIBUTE_SCORES (SCOUT_REPORT_ID, ATTRIBUTE_NAME)` | OK: score depends on the whole pair. Validation adds a uniqueness check on the pair because Snowflake does not enforce it. |
| `PLAYER_STAGE_HISTORY` | `LIST_ID` and `PLAYER_ID` depend only on `LIST_ITEM_ID` (a part of the event's identity, not the event). This is a partial/transitive dependency: handled under 3NF-5. |
| New child tables (`*_TERMS`, `*_DEAL_TYPES`, `INTEL_RELATIONSHIPS`) | Designed with composite natural keys where every non-key column depends on the whole key. |

### 2.3 Third normal form (no non-key attribute depends on another non-key attribute)

| # | Where | Violation | Fix |
|---|---|---|---|
| 3NF-1 | `PLAYER_RECOMMENDATIONS.AGENT_NAME/AGENCY/AGENT_EMAIL/AGENT_NUMBER` | Agent facts repeated on every recommendation; agency facts depend on the agent, not the recommendation. **Not** derivable from `SUBMITTED_BY_USER_ID`: staff also enter recommendations on an agent's behalf (`test_recommendation_manual_entry_signal`). | `AGENCIES` ← `AGENTS` ← `PLAYER_RECOMMENDATIONS.AGENT_ID`. `AGENT_PROFILES` (login users) gets `AGENT_ID`. |
| 3NF-2 | `PLAYER_INFORMATION.CONTACT_NAME/CONTACT_ORGANISATION` | Organisation depends on the contact | `CONTACTS` ← `PLAYER_INFORMATION.CONTACT_ID` |
| 3NF-3 | `PLAYER_INFORMATION` reference-form columns (`RELATIONSHIP_*`, `LENGTH_*`, `RELEVANCE_*`, `REFERENCE_RATING`) | Only meaningful when `INTEL_TYPE = 'reference_form'`: attributes depend on the subtype discriminator, NULL for other rows | 1:1 subtype table `INTEL_REFERENCE_DETAILS` |
| 3NF-4 | `USERS.ROLE`, `SCOUT_REPORTS.REPORT_TYPE/PURPOSE/SCOUTING_TYPE/FLAG_CATEGORY/CLIP_CATEGORY`, `PLAYER_LIST_ITEMS.STAGE`, `PLAYER_LISTS.LIST_CATEGORY`, `PLAYER_RECOMMENDATIONS.STATUS`, `PLAYER_INFORMATION.INTEL_TYPE` | Free-text codes whose meaning/ordering/permissions live in Python constants (`VALID_ROLES`, `RECOMMENDATION_STATUSES`, stage strings in SQL). CLAUDE.md lists 5 roles, the code has 7 — the drift this causes | Lookup tables `ROLES` (with `SEES_ALL_REPORTS`), `LIST_STAGES` (order, terminal flag), `RECOMMENDATION_STATUSES`, `REPORT_TYPES`, `REPORT_PURPOSES`, `SCOUTING_TYPES`, `FLAG_CATEGORIES`, `CLIP_CATEGORIES`, `LIST_CATEGORIES`, `INTEL_TYPES` |
| 3NF-5 | `PLAYER_STAGE_HISTORY.LIST_ID/PLAYER_ID` | Determined by `LIST_ITEM_ID`. **Confirmed on live data: 44 rows disagree with their list item.** | Keep during expand (app reads them); warn check lists the 44; must be reconciled before the contract phase drops the columns |
| 3NF-6 | `SHARED_REPORT_LINKS` | **Not a violation.** Suspected a derived `SHARE_URL` and a type mismatch on `CREATED_BY`; `DESCRIBE` shows neither exists | none (validation only checks `CREATED_BY` is a known user) |
| 3NF-7 | `PLAYER_RECOMMENDATIONS.STATUS/STATUS_UPDATED_AT/STATUS_UPDATED_BY` | Current state derivable from `STATUS_HISTORY` | Intentionally kept as a *cached current state* (hot filter column). Verified on live data: 0 rows disagree with the latest history row. |

### 2.4 Deliberately not changed

* `USERS`, `PASSWORD_RESET_TOKENS`, `PLAYER_NOTES`, `SCOUT_REPORT_VIEWS`,
  `STATUS_HISTORY`, `RECOMMENDATION_NOTES_HISTORY`, `POSITION_ATTRIBUTES` are
  already 3NF. Only `USERS.ROLE` gets a lookup reference.
* `SCOUT_REPORTS.ATTRIBUTE_SCORE` (overall) is a derived sum of the per-attribute
  rows. Kept: it is written in the same transaction and read on every list/analytics
  query; validation recomputes it. Revisit if it ever drifts.
* `PLAYER_NAME` / `PLAYER_DATE_OF_BIRTH` on a recommendation are an agent's
  *claim* about a player and must survive even when the player is unlinked or later
  merged; they are not treated as duplicated player facts.

## 3. Snowflake-specific design decisions

1. **PK/UNIQUE/FK are informational on standard tables.** Snowflake enforces only
   `NOT NULL`. So every new constraint is declared (for ERD tools, dbt tests and
   the optimizer) **and** backed by a validation query in
   `backend/migrations/normalization/validate/`, which the runner executes and
   fails on. `RELY` is *not* set: with unenforced constraints it lets the optimizer
   drop joins on the strength of data nobody checks. Add `RELY` per constraint only
   once its validation query is gating in CI.
2. **Expand → migrate → contract.** New objects and columns are added alongside
   the old ones; legacy columns are dropped by `contract/` scripts only after the
   app has cut over. No app release is coupled to a DDL step. This matches the
   existing cutover style (re-runnable, parity-checked).
3. **Rollback = zero-copy clones.** `000_snapshot.sql` clones every table it will
   touch into `CAFC_DB.CORE_PRE_NORMALIZATION` (`IF NOT EXISTS`: a re-run never
   overwrites the first snapshot). Free until divergence; Time Travel covers the rest.
4. **No indexes / no clustering.** These tables hold thousands to low millions of
   rows; Snowflake recommends clustering only for multi-TB tables, and standard
   tables have no indexes. The performance wins come from one canonical integer
   join key (kills the `(PLAYER_ID … OR CAFC_PLAYER_ID …)` OR-joins that prevent a
   hash join) and from removing correlated name-match subqueries, not from physical tuning.
5. **New IDs come from `AUTOINCREMENT`/sequences fetched explicitly** (Snowflake has
   no `RETURNING`); this removes the `ORDER BY CREATED_AT DESC LIMIT 1` read-back race.
6. **Hybrid tables are an option for Phase 6, not a default.** They give enforced
   PK/FK and row-level locking for the transactional tables (lists, stage moves,
   share counters) but are not available in every cloud/region/edition. Decide after
   two weeks of `QUERY_TAG` data (see the backend breakdown) — not mid-cutover.
7. **Identity resolution reuses the platform's bridge views**
   (`CORE_PLAYER_ID_RESOLUTIONS` honours overrides; `CORE_FIXTURE_ID_RESOLUTIONS`)
   instead of re-implementing matching in the app.

## 4. Target model (additions only; legacy columns stay until contract)

```
ROLES ─────────────< USERS.ROLE            (lookup, SEES_ALL_REPORTS drives RBAC)
AGENCIES ─< AGENTS ─< PLAYER_RECOMMENDATIONS >─ RECOMMENDATION_STATUSES
              └──── AGENT_PROFILES.AGENT_ID        │
                                                   ├─< RECOMMENDATION_TERMS   (TRANSFER_FEE | CURRENT_WAGES | EXPECTED_WAGES)
                                                   ├─< RECOMMENDATION_DEAL_TYPES >─ DEAL_TYPES
                                                   └── LINKED_CANONICAL_PLAYER_ID ──┐
CONTACTS ─< PLAYER_INFORMATION (intel) >─ INTEL_TYPES                          │
              ├─< INTEL_TERMS / INTEL_DEAL_TYPES / INTEL_RELATIONSHIPS         │
              └─1 INTEL_REFERENCE_DETAILS                                      ▼
SCOUT_REPORTS.CANONICAL_PLAYER_ID ──────────────────────────────────> CORE.PLAYERS.CAFC_PLAYER_ID
SCOUT_REPORTS.CANONICAL_FIXTURE_ID ─────────────────────────────────> CORE.FIXTURES.CAFC_FIXTURE_ID
PLAYER_LIST_ITEMS.CANONICAL_PLAYER_ID, PLAYER_LIST_FLAGS.CAFC_PLAYER_ID ─> CORE.PLAYERS
PLAYER_LIST_ITEMS.STAGE ─> LIST_STAGES      PLAYER_LISTS.LIST_CATEGORY ─> LIST_CATEGORIES
```

## 5. Phased plan

| Phase | Content | Status | Risk |
|---|---|---|---|
| **0 Snapshot & ledger** | `CORE_PRE_NORMALIZATION` clones; `SCHEMA_MIGRATIONS` ledger; dry-run-by-default runner that refuses live schemas | implemented, rehearsed | none |
| **1 Lookups** | 12 lookup tables, seeded from code constants ∪ distinct existing values (`ORIGIN='DATA'` rows are inactive and need a human decision) | implemented | low |
| **2 Canonical keys** | `CANONICAL_PLAYER_ID`/`CANONICAL_FIXTURE_ID` on reports; same for list items/flags/intel; `LINKED_CANONICAL_PLAYER_ID` on recommendations. **Recomputed** (not filled once) because merges rewrite the legacy columns in place. Ambiguous/unresolvable rows stay NULL and are listed by validation | implemented, rehearsed | medium (data quality) |
| **3 Decomposition** | agents/agencies, recommendation terms/deal types, contacts, intel terms/deal types/relationships/reference details | implemented | medium |
| **4 App cutover** (one PR per domain, reads first then writes; all-or-nothing per domain). Each domain's PR must also update `/admin/merge-players`, `/admin/merge-duplicate-match` and the platform remap scripts to maintain the canonical columns, and the dbt `app_compat` model for that table. | (a) recommendations + agent portal, (b) intel, (c) scout reports + lists. Replace name-matching subqueries with the key join; fix writes to be transactional; role filter unconditional | **not started** | highest |
| **5 Contract** | `contract/*.sql`: drop `LINKED_UNIVERSAL_ID`, dual-ID columns, repeated column groups, `SHARE_URL`, `DATA_SOURCE`, redundant stage-history columns | scripts written, **never auto-run** | irreversible → gated on Phase 4 soak |
| **6 Analytical layer & hardening** | One-row-per-report fact view / dynamic table (already in `REFACTOR_BACKLOG.md`), Snowflake row access policy as defense-in-depth for the role filter, secure views + read-only role for the chatbot, hybrid-table decision | plan only | — |

Phase 4 is where the performance and correctness payoff lands (recommendation
feed, dual-ID OR-joins, report listings). Phases 0–3 alone change no app behaviour.

## 6. Rollout procedure (per environment)

1. `DESCRIBE TABLE` diff against the assumptions in the migrations README. Fix any mismatch in the SQL, not the data.
2. Rehearse on a **clone**, never live `CORE`: `--create-sandbox --apply` (zero-copy clone `CAFC_DB.CORE_DEV_NORMALIZATION`; a whole-database clone needs a role with `CREATE DATABASE`, which `DEV_ROLE` lacks), then `--core CAFC_DB.CORE_DEV_NORMALIZATION` (dry-run first, then `--apply`). The runner refuses writes to `CAFC_DB.CORE`/`APP`/`APP_COMPAT` and `RECRUITMENT_TEST` without `--allow-production`. Runner executes the `validate/` queries and exits non-zero on any violating row. `warn_*` checks (unresolved keys, probable duplicate agents, redundancy that contract will drop) are reported but only fail under `--strict`, which is the gate for cutover and for every `contract/` step.
3. Review `ORIGIN='DATA'` lookup rows and validation output with the team; fix data or extend lookups via a follow-up migration.
4. Only after a clean strict validation on the duplicate and team review, apply to prod (explicit `--allow-production`) with the owning role (app roles lack `MODIFY`/`CREATE`). Migrations are additive; the running app is unaffected.
5. Keep re-running the sync files (`02x`, `030`, `040`, `050`: full recompute) until app cutover of that domain, so legacy-shaped writes **and in-place id rewrites from merges** are picked up. `--validate --strict` reports `STALE` when a re-run is due.
6. Rollback: `CREATE OR REPLACE TABLE … CLONE CAFC_DB.CORE_PRE_NORMALIZATION.<t>` for any table, or drop the new objects (nothing depends on them until Phase 4).

## 8. Whole-account scope: what exists, and what the platform actually reads and writes

The first draft looked only at `CAFC_DB.CORE`. This section is the full inventory (read-only, 2026-09-30).
Live traffic could not be observed (`SNOWFLAKE.ACCOUNT_USAGE` is not granted to `DEV_ROLE`, and
`INFORMATION_SCHEMA.QUERY_HISTORY` shows only the caller), so "what the app touches" comes from the code
plus object timestamps.

### 8.1 Everything in the account

| Database.schema | Contents | Relevance |
|---|---|---|
| `CAFC_DB.CORE` | 51 tables + 3 views: canonical players/fixtures/identities/KPIs **and** the app-owned tables | **Live.** Modified today (`SCOUT_REPORTS` 2026-09-30). This is what the app reads and writes. |
| `CAFC_DB.APP` | 25 tables, owner `APP_ROLE`, all last altered **2026-09-03** | **Stale snapshot** of `RECRUITMENT_TEST.PUBLIC` (identical row counts, e.g. 11,161 reports vs 11,684 live). Not written since. Not referenced by any code path found. Candidate for retirement (team decision). |
| `CAFC_DB.APP_COMPAT` | 19 views + 1 table, dbt-built | Passthrough views over `CORE` app tables (see 8.3) |
| `CAFC_DB.IMPECT_RAW`, `IMPECT_RAW_STAGING`, `SKILLCORNER_RAW`, `DVMS_RAW*` | provider raw/staging | App reads `IMPECT_RAW.EVENTS` / `ITERATIONS` only. Untouched by this plan. |
| `CAFC_DB.SCOUT_TOOL` | 10 tables + 31 views (Opta staging, snapshot, QA views) | App reads `SCOUT_TOOL.POSITION_PROFILE_MAP` only. Untouched. |
| `CAFC_DB.MANUAL`, `MIGRATION` | manual players/matches/squads; id maps, overrides | Migration-era; `MIGRATION.*` overrides fed `CORE.PLAYER_IDENTITY_OVERRIDES`. Untouched. |
| `CAFC_DB.CORE_DEV_*`, `APP_COMPAT_DEV_HUMARJI`, `DBT_TEST__AUDIT*` | dev copies / dbt test audit tables (264 tables) | Dev only. `CORE_DEV_RECRUITMENT` (47 tables) looks like a dev-app schema; the migrations do not touch it. |
| `RECRUITMENT_TEST.PUBLIC` | 25 legacy tables (source of the Phase 3/4 clones) | Legacy; frozen at the cutover. Untouched. |
| `CAFC_TEST_ANALYSIS.PUBLIC` | 14 IMPECT analysis tables | Unrelated to the app. Untouched. |

### 8.2 Tables the backend touches (from `main.py`, `services/`, `tools/`)

| Access | Tables | In this plan? |
|---|---|---|
| **Writes**, normalized | `SCOUT_REPORTS`, `SCOUT_REPORT_ATTRIBUTE_SCORES`, `PLAYER_LISTS`, `PLAYER_LIST_ITEMS`, `PLAYER_LIST_FLAGS`, `PLAYER_STAGE_HISTORY`, `SHARED_REPORT_LINKS`, `PLAYER_RECOMMENDATIONS`, `STATUS_HISTORY`, `AGENT_PROFILES`, `PLAYER_INFORMATION` | yes |
| **Writes**, reviewed and left as-is (already 3NF) | `USERS` (also `ALTER`/`DELETE`), `PASSWORD_RESET_TOKENS`, `PLAYER_NOTES`, `SCOUT_REPORT_VIEWS` (`MERGE`), `RECOMMENDATION_NOTES_HISTORY` | not changed; `USERS.ROLE` gets a lookup that is only validated |
| **Writes**, canonical entities | `CORE.PLAYERS`, `PLAYER_IDENTITIES`, `FIXTURES`, `FIXTURE_IDENTITIES`, sequences `CAFC_PLAYER_ID_SEQ` / `CAFC_FIXTURE_ID_SEQ`; legacy-path `PLAYERS`/`MATCHES` via `write_table()` (when `WRITES_TO_CORE` is off) | read only by the migrations; never modified |
| **Reads**, other schemas | `CORE_PLAYER_FIXTURE_KPIS`, `CORE_COMPETITIONS`, `CORE_SQUADS`, `CORE_SQUAD_ITERATION_KPIS`, `CORE_PLAYER_ID_RESOLUTIONS`, `POSITION_ATTRIBUTES`, `APP_COMPAT.PLAYERS`/`MATCHES` (66 + 37 call sites), `IMPECT_RAW.EVENTS`/`ITERATIONS`, `SCOUT_TOOL.POSITION_PROFILE_MAP` | untouched |
| Chatbot | `SCOUT_REPORTS`, `PLAYERS`, `MATCHES`, `USERS` (allowlist in `services/sql_generator.py`) | new tables are not on the allowlist |
| Dead / legacy | `SQUAD_CHANGE_LOG` (`DESCRIBE`d at request time, exists only in `APP`/`RECRUITMENT_TEST`, **not in `CORE`**), `NOTIFICATIONS`, `SCOUT_ASSIGNMENT*` | see 8.4 |

### 8.3 Dependents downstream of the tables being altered

Found by scanning every view definition in `CAFC_DB` and the `cafc-data-platform` repo.

| Dependent | What it does | Consequence for this plan |
|---|---|---|
| dbt `app_compat.*` views (13 over the altered tables) | `select *` passthroughs; `PLAYER_INFORMATION` = `pi.*, r.cafc_player_id AS CAFC_PLAYER_ID` joined on `pi.PLAYER_ID` | Added columns are harmless. **Contract must not drop `PLAYER_INFORMATION.PLAYER_ID`/`DATA_SOURCE` or `PLAYER_STAGE_HISTORY.PLAYER_ID`, nor rename `CANONICAL_PLAYER_ID` to `CAFC_PLAYER_ID`** (explicit references / duplicate column). Removed from the contract scripts and deferred until the dbt models change. |
| `/admin/merge-players`, `/admin/merge-duplicate-match` | rewrite `PLAYER_ID`, `CAFC_PLAYER_ID`, `MATCH_ID`, `UNIVERSAL_ID`, `LINKED_UNIVERSAL_ID` in place | **Design flaw found and fixed:** the first draft only filled NULL keys, so canonical keys would go stale after any merge. Keys are now a full recompute (views + `IS DISTINCT FROM`), a `STALE` check exists, and Phase 4 must make these endpoints write the canonical columns. |
| `cafc-data-platform` `snowflake/ddl/*remap*` and `python/identity/*` | remap ids in the same app tables; the merge plan (`docs/runbooks/duplicate-player-merge-plan.md`) retires players with `IS_ACTIVE = FALSE` and plans `MERGED_INTO_CAFC_PLAYER_ID` (not yet present) | Same staleness path. A check flags canonical keys that point at a retired player (0 today). Resolution goes through `CORE_PLAYER_ID_RESOLUTIONS`, so identity overrides are followed automatically. |
| Tableau / other BI | not visible from Snowflake | **Unknown.** Anything reading `APP_COMPAT` or `CORE` app tables directly must be inventoried before Phase 5. |
| `CAFC_DB.APP` copy, `RECRUITMENT_TEST` | stale copies | Not migrated; not affected. |

### 8.4 Findings to act on outside this plan

* `CAFC_DB.APP` is a stale September snapshot owned by the production role. Decide whether to retire it so nobody reads it by mistake.
* `SQUAD_CHANGE_LOG` is `DESCRIBE`d at request time but is not in `CORE`; that call can only be failing or hitting a search-path default. Worth confirming in the app logs.
* `PLAYER_NOTES.PLAYER_ID` and `PLAYER_STAGE_HISTORY.PLAYER_ID` have the same overloaded-id problem as the migrated tables; they were reviewed and left for a later phase (`PLAYER_STAGE_HISTORY.PLAYER_ID` is referenced by a dbt view).

## 7. Known risks / open questions

* **Ownership**: in the clone `DEV_ROLE` owns every table, so `ALTER TABLE` always works there. In live `CORE` some app tables were noted as admin-owned (`backend/migrations/add_clip_category_to_scout_reports.sql`); the production apply must run as the owning role. The rehearsal does not prove that.
* **Impact on the running app** (applying 000–090 to live `CORE`): additive only. Verified by reading the code: no `SELECT`/`INSERT` on an altered table uses `table.*` or an unlisted column set, the recommendation feed reads via explicit columns, and the `app_compat` dbt views that `select *` do not clash with the new column names. One near-miss was found and removed: the app already aliases a derived `LINKED_CAFC_PLAYER_ID`, so the new real column is named `LINKED_CANONICAL_PLAYER_ID`. New columns stay NULL for rows written by the legacy code until the backfills are re-run (see rollout step 5). The chatbot's table allowlist does not include the new tables.
* **`SCOUT_REPORTS.MATCH_ID` is overloaded**: the app stores an IMPECT match id for external fixtures and `CAFC_MATCH_ID` for internal ones in the same column. Resolution prefers the IMPECT identity and only falls back to a `CAFC_FIXTURE_ID` that has *no* IMPECT identity; rows where both interpretations exist with different answers are left NULL and reported (live data: 0 ambiguous, 37 matching neither).
* **Agent de-duplication** keys on normalized email, falling back to normalized name+agency. Expect some manual merges; the validation report lists near-duplicates.
* **Loan Manager rule** (CLAUDE.md vs code) is unresolved and **out of scope** here; `ROLES.SEES_ALL_REPORTS` is the hook where it will be encoded once decided.
* **Soak period**: dual-ID columns must not be dropped until the `cutover_compare` harness shows no diff on the migrated domains.
