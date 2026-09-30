# Recruitment platform database audit

Read-only audit of the live `CAFC_DB` tables that the recruitment platform reads and writes, 2026-09-30.
Scope is only what the platform touches. Everything below was measured with `SELECT`/`DESCRIBE` against live
`CAFC_DB.CORE`; nothing was modified. To reproduce or re-check after a fix:
`python backend/tools/profile_recruitment_tables.py` (SELECT-only; prints one line per check, so you can diff runs).

## 1. Scope: what the platform uses

**App-owned tables (read and written by the backend), `CAFC_DB.CORE`:**
`USERS`, `PASSWORD_RESET_TOKENS`, `AGENT_PROFILES`, `PLAYER_RECOMMENDATIONS`, `STATUS_HISTORY`,
`RECOMMENDATION_NOTES_HISTORY`, `PLAYER_INFORMATION` (intel), `PLAYER_NOTES`, `SCOUT_REPORTS`,
`SCOUT_REPORT_ATTRIBUTE_SCORES`, `SCOUT_REPORT_VIEWS`, `SHARED_REPORT_LINKS`, `PLAYER_LISTS`,
`PLAYER_LIST_ITEMS`, `PLAYER_STAGE_HISTORY`, `PLAYER_LIST_FLAGS`, `POSITION_ATTRIBUTES` (read-only).

**Canonical entity tables the backend also writes:** `PLAYERS`, `PLAYER_IDENTITIES`, `FIXTURES`,
`FIXTURE_IDENTITIES` (when a user adds a player or match); `PLAYER_IDENTITY_OVERRIDES` (platform team).

**Read-only inputs:** `CORE_PLAYER_ID_RESOLUTIONS`, `CORE_FIXTURE_ID_RESOLUTIONS` (views), `CORE_SQUADS`,
`CORE_COMPETITIONS`, `CORE_PLAYER_FIXTURE_KPIS` (37.0M rows), `CORE_SQUAD_ITERATION_KPIS` (14.4M),
`APP_COMPAT.PLAYERS`/`MATCHES` views, `IMPECT_RAW.EVENTS`/`ITERATIONS`, `SCOUT_TOOL.POSITION_PROFILE_MAP`.

`CAFC_DB.APP` is a stale 2026-09-03 snapshot (nothing reads or writes it); the live tables are in `CORE`.

## 2. Row counts and declared keys

| Table | Rows | Primary key | Notes |
|---|---:|---|---|
| `USERS` | 268 | `ID`; unique `USERNAME` | 224 agents, 30 scouts, 6 senior managers, 4 loan managers, 2 admins, 2 intel reviewers |
| `AGENT_PROFILES` | 224 | `USER_ID` | 1:1 with agent users |
| `PLAYER_RECOMMENDATIONS` | 596 | `ID` | **41 columns**, 16 MB-wide text columns |
| `STATUS_HISTORY` / `RECOMMENDATION_NOTES_HISTORY` | 921 / 476 | `ID` | FK on notes to recommendations is declared |
| `PLAYER_INFORMATION` | 278 | **none** | ids happen to be unique and non-null today |
| `PLAYER_NOTES` | 1 | `ID` | effectively unused |
| `SCOUT_REPORTS` | 11,684 | `ID` | 24 columns, mostly unbounded text |
| `SCOUT_REPORT_ATTRIBUTE_SCORES` | 63,180 | **none** | `SCOUT_REPORT_ID` is `VARCHAR`; parent `ID` is `NUMBER` |
| `SCOUT_REPORT_VIEWS` | 45,262 | `ID`; unique (report, user) | |
| `SHARED_REPORT_LINKS` | 128 | `ID`; unique `SHARE_TOKEN` | |
| `PLAYER_LISTS` / `PLAYER_LIST_ITEMS` | 34 / 2,929 | `ID` | |
| `PLAYER_STAGE_HISTORY` | 6,521 | `ID` | 3 declared FKs |
| `PLAYER_LIST_FLAGS` | 32 | `UNIVERSAL_ID` | |
| `POSITION_ATTRIBUTES` | 110 | `ID`; unique (position, attribute) | 11 profiles x 10 attributes |
| `PASSWORD_RESET_TOKENS` | 3 | **none** | |
| `PLAYERS` | 123,547 | `CAFC_PLAYER_ID` | |
| `PLAYER_IDENTITIES` / `FIXTURES` / `FIXTURE_IDENTITIES` | 427,178 / 176,843 / 177,101 | yes | |

Snowflake enforces only `NOT NULL` on these tables; primary, unique and foreign keys are documentation.
Only 7 foreign keys are declared across the whole set, and (section 4.A) some of them are violated.

## 3. How the data hangs together

```
USERS ─┬─< SCOUT_REPORTS >─┬─< SCOUT_REPORT_ATTRIBUTE_SCORES   (10 rows per Player Assessment)
       │        │          ├─< SCOUT_REPORT_VIEWS              (who has read it)
       │        │          └─< SHARED_REPORT_LINKS             (public share tokens)
       │        └── player: PLAYER_ID (IMPECT id) OR CAFC_PLAYER_ID     ── dual key ──┐
       │            fixture: MATCH_ID (IMPECT id OR manual CAFC id)                  │
       ├─< PLAYER_LISTS ─< PLAYER_LIST_ITEMS ─< PLAYER_STAGE_HISTORY                  │
       │                        └── PLAYER_ID / CAFC_PLAYER_ID                        ▼
       ├─< PLAYER_INFORMATION (intel)  .PLAYER_ID (IMPECT id in all 278 rows)   CORE.PLAYERS
       ├─  AGENT_PROFILES (1:1 for agent users) ─< PLAYER_RECOMMENDATIONS            ▲
       │        └─< STATUS_HISTORY, RECOMMENDATION_NOTES_HISTORY                     │
       └─  PLAYER_LIST_FLAGS (UNIVERSAL_ID 'external_<id>')  ── resolves via CORE_PLAYER_ID_RESOLUTIONS
```

Scout-report position codes (19 of them, e.g. `RW`, `LCB(2)`) map to 11 attribute profiles (`WINGER`, `WIDE CB`, ...)
through a dictionary hard-coded in `main.py` (~line 8845), not through a table.

## 4. Findings

Counts are exact as of 2026-09-30. Severity is my judgement: **High** = wrong or unrecoverable data, or a
constraint the schema claims but does not hold; **Medium** = design debt that causes bugs or slow queries;
**Low** = cleanup.

### A. Referential integrity and missing keys

| # | Severity | Finding | Count |
|---|---|---|---|
| A1 | High | `PLAYER_STAGE_HISTORY` rows whose list item no longer exists, despite a declared FK `LIST_ITEM_ID -> PLAYER_LIST_ITEMS.ID`. Deleting an item leaves its history. Decide: history is an audit trail (drop the FK) or should cascade | **536** (+5 whose list is gone) |
| A2 | High | `SCOUT_REPORT_VIEWS` rows for users that no longer exist (deleting a user does not clean up) | **3,816** of 45,262 (8%) |
| A3 | Medium | `SCOUT_REPORT_VIEWS` rows for deleted reports | 455 |
| A4 | Medium | `SHARED_REPORT_LINKS` pointing at deleted reports, despite a declared FK | 2 |
| A5 | Medium | `SCOUT_REPORT_ATTRIBUTE_SCORES` rows for a report that does not exist (report 22801) | 10 |
| A6 | Medium | `STATUS_HISTORY` rows for recommendations that do not exist | 6 |
| A7 | High | No primary key on `PLAYER_INFORMATION`, `SCOUT_REPORT_ATTRIBUTE_SCORES`, `PASSWORD_RESET_TOKENS`. The attribute-score table is the largest child table and the app deletes and re-inserts its rows when a report is edited | 3 tables |
| A8 | Medium | `SCOUT_REPORT_ATTRIBUTE_SCORES.SCOUT_REPORT_ID` is `VARCHAR`, its parent `ID` is `NUMBER`. Every join relies on implicit conversion, which blocks partition pruning and clean hash joins | 63,180 rows |
| A9 | Low | 125 of 127 *active* share links have already expired (`IS_ACTIVE` is never cleared; the app must be checking `EXPIRES_AT`) | 125 |

### B. Player and fixture identity (the dual key)

Reports, list items, recommendations, intel and flags each identify a player differently, which forces OR-joins
and `DATA_SOURCE` branching everywhere.

| # | Severity | Finding | Count |
|---|---|---|---|
| B1 | High | `SCOUT_REPORTS`: `PLAYER_ID` only 11,580, `CAFC_PLAYER_ID` only 87, both 17 | 11,684 |
| B2 | High | Reports whose player cannot be resolved: IMPECT id unknown (4) plus one report carrying a `CAFC_PLAYER_ID` that is not in `PLAYERS` | 4 + 1 |
| B3 | High | `MATCH_ID` is overloaded: an IMPECT match id for 9,472 reports, a manual fixture's CAFC id for 994, and **matches nothing for 37**. (No report is ambiguous today.) | 37 dead |
| B4 | Medium | List items: 3 carry a `CAFC_PLAYER_ID` not in `PLAYERS`, 2 IMPECT ids do not resolve; 6 carry both keys | 5 |
| B5 | Medium | Recommendations: 29 have a `LINKED_UNIVERSAL_ID` that no longer resolves; 21 are unlinked. The id is a composite packed into a string (`external_<id>`) | 29 + 21 |
| B6 | Medium | Intel `DATA_SOURCE` carries no information: 258 `external`, 4 `NULL`, **never `internal`**; `PLAYER_ID` is an IMPECT id in all 278 rows | 278 |
| B7 | Low | No report or list item points at a retired (`IS_ACTIVE = FALSE`) player yet; this changes as the platform's merges land | 0 |

### C. Denormalisation (1NF / 3NF)

| # | Severity | Finding | Count |
|---|---|---|---|
| C1 | High | **Comma-joined lists in one column** on `PLAYER_RECOMMENDATIONS`: `RECOMMENDED_POSITION` on **270 of 596 (45%)**, `POTENTIAL_DEAL_TYPE` 88, `AGREEMENT_TYPE` 17, `CONTRACT_OPTIONS` 13 (intel `POTENTIAL_DEAL_TYPE` 19). These cannot be filtered or counted without string matching | 388 rows |
| C2 | High | Vocabulary drift: intel deal types are lowercase codes (`permanent`, `loan_with_option`, `na`), recommendations use labels (`Permanent Transfer`, `Loan with Option`) for the same concept | 2 vocabularies |
| C3 | Medium | `AGREEMENT_TYPE` holds `Player Agreement/Mandate` (136 uses) and `Club Mandate` (1), which are in neither the UI nor `ALLOWED_AGREEMENT_TYPES`. Re-saving such a row through the API would be rejected | 137 |
| C4 | Medium | Fee and wages are repeating column groups (`_AMOUNT`, `_MIN`, `_MAX`, `_CURRENCY`, plus a legacy text/number column each). 80 recommendations have free-text `TRANSFER_FEE` with no parsed amount | 80 |
| C5 | Medium | **Agent columns on a recommendation are a pure copy of the submitter's profile.** `AGENT_NAME`/`AGENCY`/`AGENT_EMAIL`/`AGENT_NUMBER` differ from `AGENT_PROFILES` in **0 of 596** rows; every recommendation was submitted by an agent user; each submitter has exactly one agent identity | 596 rows |
| C6 | Low | `AGENCY` is free text on 224 profiles for 196 distinct agencies (4 have spelling variants) | 196 |
| C7 | Medium | `PLAYER_STAGE_HISTORY.LIST_ID` is derivable from `LIST_ITEM_ID` and **disagrees with it on 44 rows** | 44 |
| C8 | Low | `PLAYER_RECOMMENDATIONS.STATUS`/`STATUS_UPDATED_*` duplicate the latest `STATUS_HISTORY` row. Kept on purpose as a cached current state; currently 0 disagree. 70 recommendations have no history row (consistent with the 70 still at `Submitted`: the initial status is never logged) | 0 / 70 |

### D. Data quality

| # | Severity | Finding | Count |
|---|---|---|---|
| D1 | Medium | Report positions use two vocabularies: 19 short codes (`RW`) and older long labels (`CM - Wide Diamond Midfielder`) on **2,556 Flag reports**; 1,364 reports have an empty position (1,181 Clips + 183 Flags); 7 have stray whitespace; 74 distinct values in total | see text |
| D2 | Medium | Probable duplicate reports (same player, user, match, type, day) | 4 groups |
| D3 | Medium | Probable duplicate recommendations (same agent email and player name) | 9 groups |
| D4 | Low | 27 recommendations have a contract expiry before their submission date; 1 has a future submission date; 1 implausible player date of birth | 29 |
| D5 | Low | `PLAYER_LIST_ITEMS.DISPLAY_ORDER` duplicated within a list | 9 lists |
| D6 | Low | 1 list item's cached `STAGE` differs from its latest history row | 1 |
| D7 | Low | `FLAG_CATEGORY` has both `No Action` and `No action` | 9 rows |
| D8 | Low | Users: 2 with blank email, 2 with blank names, 5 non-agent accounts with no reports, lists or views | 9 |

### E. Design that lives in code, not data

| # | Severity | Finding |
|---|---|---|
| E1 | Medium | The position-code -> attribute-profile mapping is a Python dictionary. `POSITION_ATTRIBUTES` is keyed by 11 profile names while reports store 19 codes. It works (all 63,180 scores are valid for their profile) but the rule cannot be queried or changed without a deploy |
| E2 | Medium | Role, stage, status, report type, purpose and flag-category vocabularies exist only as Python constants and free-text columns. CLAUDE.md lists 5 roles; the code has 7 |
| E3 | Low | Attribute scores are keyed by attribute **name** (40 distinct names, all valid today), not by an id into the catalogue |
| E4 | Medium | Wide unbounded text columns (`VARCHAR(16777216)` on 30+ columns) carry no length or domain protection |

### F. Canonical entities the platform writes (`CORE`)

| # | Severity | Finding | Count |
|---|---|---|---|
| F1 | High | Probable duplicate fixtures: IMPECT match ids mapped to more than one `CAFC_FIXTURE_ID` | 230 ids, 236 extra |
| F2 | High | `PLAYER_IDENTITIES`: 10 `(source system, source id)` pairs map to more than one player; `IS_PRIMARY` is set on several identity rows per player (the grain is per player and squad context) | 10 pairs; 69,607 (system, player) groups |
| F3 | Medium | `PLAYERS.CURRENT_SQUAD_ID` not found in `CORE_SQUADS` | 8,787 (7%) |
| F4 | Medium | `FIXTURES` home/away squad id not in `CORE_SQUADS` | 5,305 / 5,300 |
| F5 | Medium | `PLAYERS` with no birth date | 7,234 |
| F6 | Low | Implausible birth dates; same name and birth date (probable duplicate players); fixtures with no date / no squads | 29; 4 groups; 20 / 42 |
| F7 | Info | 38 retired players have no identity rows (consistent with the platform's merge process); 108 manual players and 280 manual fixtures | |

## 5. What is healthy

- `USERS`: no duplicate usernames or emails, all passwords are bcrypt, every reference to a user from reports, lists, recommendations and stage history resolves (the exception is `SCOUT_REPORT_VIEWS`, finding A2).
- Agents: exactly 224 agent users and 224 profiles, 1:1, with no gaps and no mismatched emails.
- Scout reports: no orphan users, no scores outside 1-10, every Player Assessment has exactly 10 attribute scores and every Flag/Clips report has none, `ATTRIBUTE_SCORE` equals the sum of its scores on all 6,317, and every score row is valid for its position's profile.
- Recommendations: status matches the latest history row on every row; no orphan submitters; wages and their `_AMOUNT` twins agree; amounts always have a currency.
- Lists: no orphan lists or owners, no player listed twice in one list, all flags resolve.

## 6. Corrections to my earlier work in this session

I made three mistakes in the first design and one near-mistake; all are fixed in the migrations.

1. **A separate `AGENTS` table was wrong.** I assumed staff enter recommendations on an agent's behalf. The data shows none do (C5), so `AGENTS` would have been a 1:1 duplicate of `AGENT_PROFILES`. It is replaced by `AGENCIES` only.
2. **Comma-joined columns were under-counted.** I covered deal types and relationship; `RECOMMENDED_POSITION` (45% of rows), `AGREEMENT_TYPE` and `CONTRACT_OPTIONS` now have lookups and junction tables too (C1).
3. **`SHARED_REPORT_LINKS.SHARE_URL` does not exist**, and `CREATED_BY` is already numeric; nothing to fix there.
4. A "63,170 attribute rows do not match" result was my own wrong join; going through the code's real position mapping, all rows are valid.

## 7. Suggested order to fix it

1. **Add the missing keys and fix the type** (A7, A8): primary keys on the three tables; `SCOUT_REPORT_ID` to `NUMBER`. Cheap, and everything else gets safer.
2. **Decide the delete policy** (A1-A6): keep history rows for deleted items/users/reports (then drop the false FKs) or clean them up. Then purge the orphan rows accordingly, and make the delete endpoints do it.
3. **Normalise the recommendation columns** (C1-C6): the migrations on this branch (`030`, `040`), which also unify the deal-type vocabularies (C2) and surface the legacy agreement values for a decision (C3).
4. **One key per player and fixture** (B1-B6): the `02x` migrations add `CANONICAL_*` keys alongside the old columns; resolve the 4 + 1 + 37 + 5 + 29 unresolved references by hand first.
5. **Fix the canonical entities** (F1-F4), which is platform-team data: duplicate fixtures and multi-mapped identities corrupt every join above.
6. **Move the position mapping and vocabularies into tables** (E1-E2).

Migrations and tooling: `backend/migrations/normalization/` (rehearsed on a clone, `CAFC_DB.CORE_DEV_NORMALIZATION`; live
`CORE` untouched). Design rationale: `docs/DATA_MODEL_NORMALIZATION_PLAN.md`.
