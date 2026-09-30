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

## Quick start

```bash
cd backend
python tools/run_normalization_migrations.py --core CAFC_DB.CORE_DEV_<you>            # dry run
python tools/run_normalization_migrations.py --core CAFC_DB.CORE_DEV_<you> --apply    # rehearse in a dev schema
python tools/run_normalization_migrations.py --validate --strict                      # the cutover gate
python tools/run_normalization_migrations.py --mark-cutover recommendations           # freeze that domain's rebuild files
python tools/run_normalization_migrations.py --contract recommendations --apply       # drop legacy columns (destructive)
```

Run as a role that owns the tables (the app role has DML only, no `ALTER`/`CREATE`); set
`NORMALIZATION_ROLE` or `SNOWFLAKE_DEV_ROLE`. A dev rehearsal needs the dev schema to hold copies of the
tables and the dbt views `CORE_PLAYER_ID_RESOLUTIONS` / `CORE_FIXTURE_ID_RESOLUTIONS`
(dbt `+schema: CORE` on a non-prod target produces `CORE_<target schema>`).

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
