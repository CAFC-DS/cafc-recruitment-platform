# Normalization migrations

Design and rationale: [`docs/DATA_MODEL_NORMALIZATION_PLAN.md`](../../../docs/DATA_MODEL_NORMALIZATION_PLAN.md).
Runner: `backend/tools/run_normalization_migrations.py` (dry run by default).

| File | What it does | Re-run safe? |
|---|---|---|
| `000_snapshot.sql` | Zero-copy clones of every table touched, into `<core>_PRE_NORMALIZATION` | yes (never overwrites) |
| `010_lookups.sql` | 12 lookup tables, seeded from code constants + distinct data values | yes (insert-only MERGE) |
| `020_canonical_keys.sql` | `CANONICAL_PLAYER_ID` / `CANONICAL_FIXTURE_ID` / `LINKED_CAFC_PLAYER_ID` etc. | yes (fills NULLs only) |
| `030_agents.sql` | `AGENCIES`, `AGENTS`, `AGENT_ID` on recommendations and agent profiles | yes (insert-only) |
| `040_recommendation_terms.sql` | `RECOMMENDATION_TERMS`, `RECOMMENDATION_DEAL_TYPES` | yes until recommendations cut over (`@sync-until-cutover`) |
| `050_intel.sql` | `CONTACTS`, `INTEL_TERMS`, `INTEL_DEAL_TYPES`, `INTEL_RELATIONSHIPS`, `INTEL_REFERENCE_DETAILS` | yes until intel cuts over |
| `090_grants.sql` | grants on the new objects | yes |
| `validate/*.sql` | hard checks (zero rows = pass); `warn_*` are informational, failures under `--strict` | read-only |
| `contract/*.sql` | **destructive** column drops; only via `--contract <domain>` after cutover + clean strict validation | one-way |

Nothing in `000`–`090` drops or rewrites an existing column, so the running app is unaffected.

## Quick start — always on a duplicate database, never `CAFC_DB`

The runner refuses `--apply`, `--mark-cutover` and `--contract` against `CAFC_DB` or
`RECRUITMENT_TEST` (override: `--allow-production`, for a reviewed production run only).
Dry runs and `--validate` are read-only and allowed anywhere.

```bash
cd backend
# 1. Duplicate the database (zero-copy clone: instant, no extra storage until it diverges;
#    IF NOT EXISTS, so it never replaces an existing sandbox)
python tools/run_normalization_migrations.py --create-sandbox            # dry run: prints the DDL
python tools/run_normalization_migrations.py --create-sandbox --apply    # CREATE DATABASE CAFC_DB_NORMALIZATION CLONE CAFC_DB

# 2. Rehearse the migrations inside the duplicate
python tools/run_normalization_migrations.py --core CAFC_DB_NORMALIZATION.CORE            # dry run
python tools/run_normalization_migrations.py --core CAFC_DB_NORMALIZATION.CORE --apply    # apply + validate
python tools/run_normalization_migrations.py --core CAFC_DB_NORMALIZATION.CORE --validate --strict

# Later, per domain (still in the duplicate until the app is pointed at it)
python tools/run_normalization_migrations.py --core CAFC_DB_NORMALIZATION.CORE --mark-cutover recommendations
python tools/run_normalization_migrations.py --core CAFC_DB_NORMALIZATION.CORE --contract recommendations --apply
```

Notes on the clone: views are cloned as written, so the dbt views `CORE_PLAYER_ID_RESOLUTIONS` /
`CORE_FIXTURE_ID_RESOLUTIONS` in the duplicate may still read the *original* `CAFC_DB` tables underneath
(read-only, harmless for validation, but identity resolution then reflects production, not the duplicate).
Grants are not copied to a cloned database's objects the same way; `090_grants.sql` re-applies them.
Point a backend at the duplicate with `CANONICAL_DB=CAFC_DB_NORMALIZATION` (and `CORE_DB_SCHEMA=CORE`) to
test the app against it.

Run as a role that owns the tables (the app role has DML only, no `ALTER`/`CREATE`); set
`NORMALIZATION_ROLE` or `SNOWFLAKE_DEV_ROLE`. 
## UNVERIFIED schema assumptions — check with `DESCRIBE TABLE` before the first apply

These migrations were written without a live Snowflake connection (connector unavailable);
column names come from `backend/main.py`, `backend/migrations/*.sql` and the dbt models.

| Table | Columns the SQL relies on |
|---|---|
| `SCOUT_REPORTS` | `ID, PLAYER_ID, CAFC_PLAYER_ID, MATCH_ID, REPORT_TYPE, PURPOSE, SCOUTING_TYPE, FLAG_CATEGORY, CLIP_CATEGORY, ATTRIBUTE_SCORE` |
| `SCOUT_REPORT_ATTRIBUTE_SCORES` | `SCOUT_REPORT_ID, ATTRIBUTE_NAME, ATTRIBUTE_SCORE` |
| `PLAYER_LISTS` | `LIST_CATEGORY` |
| `PLAYER_LIST_ITEMS` | `ID, LIST_ID, PLAYER_ID, CAFC_PLAYER_ID, STAGE` |
| `PLAYER_LIST_FLAGS` | `UNIVERSAL_ID` |
| `PLAYER_STAGE_HISTORY` | `ID, LIST_ITEM_ID, LIST_ID, PLAYER_ID, OLD_STAGE, NEW_STAGE` |
| `SHARED_REPORT_LINKS` | `SHARE_TOKEN, SHARE_URL, CREATED_BY` |
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
