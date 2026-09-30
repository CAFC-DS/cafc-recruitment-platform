# Normalization migrations

Design and rationale: [`docs/DATA_MODEL_NORMALIZATION_PLAN.md`](../../../docs/DATA_MODEL_NORMALIZATION_PLAN.md).
Runner: `backend/tools/run_normalization_migrations.py` (dry run by default).

| File | What it does | Re-run safe? |
|---|---|---|
| `000_snapshot.sql` | Zero-copy clones of every table touched, into `<core>_PRE_NORMALIZATION` | yes (never overwrites) |
| `010_lookups.sql` | 12 lookup tables, seeded from code constants + distinct data values | yes (insert-only MERGE) |
| `020_canonical_keys.sql` | `CANONICAL_PLAYER_ID` / `CANONICAL_FIXTURE_ID` / `LINKED_CANONICAL_PLAYER_ID` etc. | yes (fills NULLs only) |
| `030_agents.sql` | `AGENCIES`, `AGENTS`, `AGENT_ID` on recommendations and agent profiles | yes (insert-only) |
| `040_recommendation_terms.sql` | `RECOMMENDATION_TERMS`, `RECOMMENDATION_DEAL_TYPES` | yes until recommendations cut over (`@sync-until-cutover`) |
| `050_intel.sql` | `CONTACTS`, `INTEL_TERMS`, `INTEL_DEAL_TYPES`, `INTEL_RELATIONSHIPS`, `INTEL_REFERENCE_DETAILS` | yes until intel cuts over |
| `090_grants.sql` | grants on the new objects | yes |
| `validate/*.sql` | hard checks (zero rows = pass); `warn_*` are informational, failures under `--strict` | read-only |
| `contract/*.sql` | **destructive** column drops; only via `--contract <domain>` after cutover + clean strict validation | one-way |

Nothing in `000`–`090` drops or rewrites an existing column, so the running app is unaffected.

## Quick start — always on a clone, never on the live schemas

The runner refuses `--apply`, `--mark-cutover` and `--contract` against the live app schemas
(`CAFC_DB.CORE`, `CAFC_DB.APP`, `CAFC_DB.APP_COMPAT`) and anything in `RECRUITMENT_TEST`
(override: `--allow-production`, for a reviewed production run only). Dry runs and `--validate`
are read-only and allowed anywhere.

```bash
cd backend
# 1. Zero-copy clone of CORE (instant; no extra storage until it diverges; IF NOT EXISTS, never replaces).
#    Default is a schema clone because DEV_ROLE has CREATE SCHEMA but not CREATE DATABASE.
#    With a role that can CREATE DATABASE:  --create-sandbox CAFC_DB_COPY  (clones the whole database)
python tools/run_normalization_migrations.py --create-sandbox --apply     # CAFC_DB.CORE_DEV_NORMALIZATION

# 2. Migrate the clone (applies 000-090, then runs validate/)
python tools/run_normalization_migrations.py --core CAFC_DB.CORE_DEV_NORMALIZATION --apply
python tools/run_normalization_migrations.py --core CAFC_DB.CORE_DEV_NORMALIZATION --validate --strict   # cutover gate

# 3. Later, per domain
python tools/run_normalization_migrations.py --core <target> --mark-cutover recommendations
python tools/run_normalization_migrations.py --core <target> --contract recommendations --apply         # destructive
```

Connection: `SNOWFLAKE_PRIVATE_KEY` (inline PEM) or `SNOWFLAKE_[DEV_]PRIVATE_KEY_PATH`, plus
`SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER[NAME]`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_ROLE`
(override the role with `NORMALIZATION_ROLE`).

A clone's views are cloned as written: `CORE_PLAYER_ID_RESOLUTIONS` / `CORE_FIXTURE_ID_RESOLUTIONS` in the
sandbox read the live identity tables (read-only, so production is safe, but key resolution reflects
production). `--validate` is safe to run against live `CORE` once the migrations have been applied there.

## Rehearsal result (2026-09-30, `CAFC_DB.CORE_DEV_NORMALIZATION`, clone of live CORE)

All of 000-090 applied first time, re-ran clean (idempotent), hard validation **PASS**. Live `CORE`
verified untouched (no new tables/columns/functions). Row counts reconciled against source:
706/706 recommendation deal-type pairs, 510/510 transfer-fee terms, 596/596 recommendations and
224/224 agent profiles linked to an agent (224 agents, 196 agencies), 168 contacts, 278/278 intel
reports keyed. Reports: 11,680/11,684 got a canonical player and 10,466/10,503 a canonical fixture.

Informational findings (warnings, all pre-existing data, decisions for the team):

| Finding | Count |
|---|---|
| reports whose player cannot be resolved (incl. 1 `CAFC_PLAYER_ID` not in `PLAYERS`) | 4 |
| reports whose `MATCH_ID` matches neither an IMPECT nor a manual fixture | 37 |
| list items with no resolvable player | 5 |
| recommendations linked to a player that cannot be resolved | 29 |
| `FLAG_CATEGORY` case variant `'No action'` vs `'No Action'` (left inactive) | 9 rows |
| probable duplicate agents (same name, different email) | 2 pairs |
| `PLAYER_STAGE_HISTORY.LIST_ID` disagrees with its list item | 44 |
| attribute-score rows whose report does not exist (report 22801) | 10 |
| ambiguous `MATCH_ID` (matches both an IMPECT and a manual fixture) | 0 |

## Schema assumptions — VERIFIED against the live schema on 2026-09-30

The migrations were first written from code (the MCP connector was down), then checked with
`DESCRIBE` over a direct connector session. One assumption was wrong and is fixed:
`SHARED_REPORT_LINKS` has no `SHARE_URL` (and `CREATED_BY` is already numeric).
Data-driven corrections from profiling live values: intel deal types use a different vocabulary
(`permanent`, `loan_with_option`, `na`) than recommendations (`CANONICAL_DEAL_TYPE()` maps them);
intel `PLAYER_ID` is an IMPECT id even where `DATA_SOURCE` is NULL; `Stage 4` and the legacy flag
grades are real values.

| Table | Columns the SQL relies on |
|---|---|
| `SCOUT_REPORTS` | `ID, PLAYER_ID, CAFC_PLAYER_ID, MATCH_ID, REPORT_TYPE, PURPOSE, SCOUTING_TYPE, FLAG_CATEGORY, CLIP_CATEGORY, ATTRIBUTE_SCORE` |
| `SCOUT_REPORT_ATTRIBUTE_SCORES` | `SCOUT_REPORT_ID, ATTRIBUTE_NAME, ATTRIBUTE_SCORE` |
| `PLAYER_LISTS` | `LIST_CATEGORY` |
| `PLAYER_LIST_ITEMS` | `ID, LIST_ID, PLAYER_ID, CAFC_PLAYER_ID, STAGE` |
| `PLAYER_LIST_FLAGS` | `UNIVERSAL_ID` |
| `PLAYER_STAGE_HISTORY` | `ID, LIST_ITEM_ID, LIST_ID, PLAYER_ID, OLD_STAGE, NEW_STAGE` |
| `SHARED_REPORT_LINKS` | `SHARE_TOKEN, CREATED_BY` |
| `PLAYER_RECOMMENDATIONS` | `ID, STATUS, AGENT_NAME, AGENCY, AGENT_EMAIL, AGENT_NUMBER, POTENTIAL_DEAL_TYPE, LINKED_UNIVERSAL_ID, CREATED_AT, UPDATED_AT`, `TRANSFER_FEE[_AMOUNT/_CURRENCY/_MIN/_MAX]`, `CURRENT_WAGES[_AMOUNT/_CURRENCY/_MIN/_MAX]`, `EXPECTED_WAGES[...]`, `WAGE_BASIS` |
| `STATUS_HISTORY` | `ID, RECOMMENDATION_ID, OLD_STATUS, NEW_STATUS, CHANGED_AT` |
| `AGENT_PROFILES` | `USER_ID, AGENT_NAME, AGENCY, AGENT_EMAIL, AGENT_NUMBER, CREATED_AT, UPDATED_AT` |
| `PLAYER_INFORMATION` | `ID, PLAYER_ID, DATA_SOURCE, INTEL_TYPE, CONTACT_NAME, CONTACT_ORGANISATION, CREATED_AT, TRANSFER_FEE, POTENTIAL_DEAL_TYPE, RELATIONSHIP_TO_PLAYER, LENGTH_/RELEVANCE_OF_RELATIONSHIP, REFERENCE_RATING, CURRENT_WAGES[_MIN/_MAX], EXPECTED_WAGES[_MIN/_MAX]` |
| `USERS` | `ID, ROLE` |
| `CORE.PLAYERS / FIXTURES / FIXTURE_IDENTITIES` | `CAFC_PLAYER_ID` / `CAFC_FIXTURE_ID` / `CAFC_FIXTURE_ID, SOURCE_SYSTEM, SOURCE_FIXTURE_ID` |
| dbt views in `CORE` | `CORE_PLAYER_ID_RESOLUTIONS (SOURCE_SYSTEM, SOURCE_PLAYER_ID, CAFC_PLAYER_ID)`, `CORE_FIXTURE_ID_RESOLUTIONS (SOURCE_SYSTEM, SOURCE_FIXTURE_ID, CAFC_FIXTURE_ID)` |

Known gaps: `PLAYER_NOTES.PLAYER_ID` is overloaded the same way as intel's but was not migrated
(no `DATA_SOURCE` column to disambiguate; confirm shape first). The agent portal's
`AGENT_STATUS` workflow is unchanged.

## Tests

`python -m pytest backend/tests/test_normalization_migrations.py` — runner helpers, guards (fake cursor),
sqlglot Snowflake-dialect parse of every file, and lint rules (re-runnable DDL, no destructive DDL outside
`contract/`, transactional rebuild files, snapshot coverage, grants, lookup seeds vs `main.py` constants).
These do **not** prove the SQL is correct against real data — only a rehearsal in a dev schema does.
