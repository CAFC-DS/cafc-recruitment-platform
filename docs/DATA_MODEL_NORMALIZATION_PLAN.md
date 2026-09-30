# Data model normalization & Snowflake migration plan

Status: **Phases 0–3 implemented as SQL on this branch (not yet applied to any Snowflake account). Phases 4–6 are plan only.**
Owner: recruitment platform · Branch: `claude/compassionate-carson-7g4wi1`

> **How this was produced.** The Snowflake connector was unavailable, so nothing
> here was checked against a live account. Table shapes were reconstructed from
> `backend/main.py` INSERT/SELECT column lists, `backend/migrations/*.sql`, the
> `cafc-data-platform` dbt models and `snowflake/ddl/*.sql`. Every migration is
> therefore written to be **additive, re-runnable, rehearsed first in a dev
> schema**, and gated by validation queries. Step 1 of rollout is a `DESCRIBE`
> diff of the assumptions in `backend/migrations/normalization/README.md`.

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
| 1NF-5 | `PLAYER_RECOMMENDATIONS.LINKED_UNIVERSAL_ID`, `PLAYER_LIST_FLAGS.UNIVERSAL_ID` | Composite value packed in a string (`internal_123` / `external_456` = source + id) | Numeric `LINKED_CAFC_PLAYER_ID` / `CAFC_PLAYER_ID` |
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
| 3NF-5 | `PLAYER_STAGE_HISTORY.LIST_ID/PLAYER_ID` | Determined by `LIST_ITEM_ID` | Keep during expand (app reads them); validation asserts they agree with the item; dropped in contract phase |
| 3NF-6 | `SHARED_REPORT_LINKS.SHARE_URL` | Derived from token + frontend host; `CREATED_BY` is VARCHAR in DDL but the app inserts an integer user id | Contract phase drops `SHARE_URL`; validation flags non-numeric `CREATED_BY` |
| 3NF-7 | `PLAYER_RECOMMENDATIONS.STATUS/STATUS_UPDATED_AT/STATUS_UPDATED_BY` | Current state derivable from `STATUS_HISTORY` | Intentionally kept as a *cached current state* (hot filter column). Validation asserts it equals the latest history row. |

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
                                                   └── LINKED_CAFC_PLAYER_ID ──┐
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
| **0 Snapshot & ledger** | `CORE_PRE_NORMALIZATION` clones; `SCHEMA_MIGRATIONS` ledger; dry-run-by-default runner | implemented | none |
| **1 Lookups** | 12 lookup tables, seeded from code constants ∪ distinct existing values (`ORIGIN='DATA'` rows are inactive and need a human decision) | implemented | low |
| **2 Canonical keys** | `CANONICAL_PLAYER_ID`/`CANONICAL_FIXTURE_ID` on reports; same for list items/flags; `LINKED_CAFC_PLAYER_ID` on recommendations. Ambiguous/unresolvable rows stay NULL and are listed by validation | implemented | medium (data quality) |
| **3 Decomposition** | agents/agencies, recommendation terms/deal types, contacts, intel terms/deal types/relationships/reference details | implemented | medium |
| **4 App cutover** (one PR per domain, reads first then writes; all-or-nothing per domain) | (a) recommendations + agent portal, (b) intel, (c) scout reports + lists. Replace name-matching subqueries with the key join; fix writes to be transactional; role filter unconditional | **not started** | highest |
| **5 Contract** | `contract/*.sql`: drop `LINKED_UNIVERSAL_ID`, dual-ID columns, repeated column groups, `SHARE_URL`, `DATA_SOURCE`, redundant stage-history columns | scripts written, **never auto-run** | irreversible → gated on Phase 4 soak |
| **6 Analytical layer & hardening** | One-row-per-report fact view / dynamic table (already in `REFACTOR_BACKLOG.md`), Snowflake row access policy as defense-in-depth for the role filter, secure views + read-only role for the chatbot, hybrid-table decision | plan only | — |

Phase 4 is where the performance and correctness payoff lands (recommendation
feed, dual-ID OR-joins, report listings). Phases 0–3 alone change no app behaviour.

## 6. Rollout procedure (per environment)

1. `DESCRIBE TABLE` diff against the assumptions in the migrations README. Fix any mismatch in the SQL, not the data.
2. Rehearse in a dev schema: `--core CAFC_DB.CORE_DEV_<you>` (dry-run first, then `--apply`). Runner executes the `validate/` queries and exits non-zero on any violating row. `warn_*` checks (unresolved keys, probable duplicate agents, redundancy that contract will drop) are reported but only fail under `--strict`, which is the gate for cutover and for every `contract/` step.
3. Review `ORIGIN='DATA'` lookup rows and validation output with the team; fix data or extend lookups via a follow-up migration.
4. Apply to prod with the owning role (app roles lack `MODIFY`/`CREATE`). Migrations are additive; the running app is unaffected.
5. Keep re-running backfills (they are `MERGE`/`UPDATE … WHERE … IS NULL`) until app cutover of that domain so new legacy-shaped writes are picked up.
6. Rollback: `CREATE OR REPLACE TABLE … CLONE CAFC_DB.CORE_PRE_NORMALIZATION.<t>` for any table, or drop the new objects (nothing depends on them until Phase 4).

## 7. Known risks / open questions

* **Column assumptions** (see README) are unverified against a live `DESCRIBE`.
* **`SCOUT_REPORTS.MATCH_ID` is overloaded**: the app stores an IMPECT match id for external fixtures and `CAFC_MATCH_ID` for internal ones in the same column. Resolution prefers the IMPECT identity and only falls back to a `CAFC_FIXTURE_ID` that has *no* IMPECT identity; rows where both interpretations exist with different answers are left NULL and reported.
* **Agent de-duplication** keys on normalized email, falling back to normalized name+agency. Expect some manual merges; the validation report lists near-duplicates.
* **Loan Manager rule** (CLAUDE.md vs code) is unresolved and **out of scope** here; `ROLES.SEES_ALL_REPORTS` is the hook where it will be encoded once decided.
* **Soak period**: dual-ID columns must not be dropped until the `cutover_compare` harness shows no diff on the migrated domains.
