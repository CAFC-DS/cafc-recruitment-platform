# Phase 6 — Native CORE Reads Roadmap

Date: 2026-09-18
Status: Approved for planning

## Problem

The app reads and writes `CAFC_DB.CORE` exclusively through `APP_COMPAT`, a
dbt view layer that reshapes canonical tables back into the exact legacy
column names/shapes the app's SQL was written against (see
`docs/recruitment-canonical-architecture.md` §2.2). This bridge was the
right choice to get phases 1-5 shipped without rewriting the app, but it's
permanent scaffolding: every query pays a translation cost, two schemas
(`CORE` + `APP_COMPAT`) have to be kept in sync, and `RECRUITMENT_TEST`
(the original legacy database) can't retire while `APP_COMPAT` still
mirrors its shape.

Phase 6 is the strangler-fig's last structural step: rewrite the app's
`~446` `read_table()`/`write_table()` call sites (`backend/main.py`,
19,200 lines) to query `CORE` in its own native shape, then drop
`APP_COMPAT`. There is no functional deadline or user-facing pain driving
this — it's closing out the migration cleanly. The recruitment team
(non-technical staff, daily users of the live app) is unaffected
functionally; risk here is entirely about not breaking a production tool
people depend on every day, not about shipping a new capability.

## Non-goals

- **`main.py` structural refactor.** Touching nearly every endpoint is a
  tempting moment to also break the file into modules, but that's a
  separate, differently-scoped, differently-risked project. Deferred to
  **Phase 7**.
- **Tableau / analyst script repointing off `RECRUITMENT_TEST`.** Flagged
  as an open item in `docs/recruitment-canonical-architecture.md` §8;
  depends on Phase 6 finishing but isn't part of implementing it.
- **`RECRUITMENT_TEST` quiet-period retirement/drop.** Same — a follow-on
  task once nothing (app or Tableau) still points at it.
- **Runtime feature flags for per-domain rollback.** Each domain ships as
  a normal PR; rollback is `git revert` + redeploy, matching how every
  other change in this codebase already ships. No deadline pressure means
  no need to pay for live-flip infrastructure.

## Table complexity catalog

From a repo audit (`dbt/models/app_compat/*.sql` + `read_table()`/
`write_table()` call-site counts in `backend/main.py`):

| table | reads | writes | shape delta |
|---|---|---|---|
| scout_reports | 103 | 9 | passthrough |
| players | 66 | 2 | **structural** — union of base+live-tail; context columns derived from different source models than legacy |
| users | 46 | 12 | passthrough (identity-source risk checked — `CORE.USERS`/`RECRUITMENT_TEST.USERS` confirmed in sync, 267 rows each, as of 2026-09-18) |
| matches | 37 | 1 | **structural** — internal/external fixture branching changes name-resolution logic, not just columns |
| player_list_items | 27 | 15 | passthrough |
| player_lists | 20 | 11 | passthrough |
| player_information | 11 | 3 | passthrough + LEFT JOIN adds CAFC_PLAYER_ID (not all rows resolve) |
| scout_report_attribute_scores | 9 | 5 | passthrough |
| player_stage_history | 9 | 2 | passthrough + identity join (~99.6% resolve) |
| player_recommendations | 5 | 8 | passthrough |
| position_attributes | 4 | 0 | passthrough, read-only |
| scout_report_views | 4 | 2 | passthrough |
| player_list_flags | 3 | 4 | passthrough |
| shared_report_links | 3 | 3 | passthrough |
| agent_profiles | 2 | 1 | passthrough |
| player_notes | 2 | 1 | passthrough + identity join |
| recommendation_notes_history | 1 | 2 | passthrough |
| status_history | 1 | 2 | passthrough |
| password_reset_tokens | 1 | 3 | passthrough |
| notifications | 0 | 0 | dead — no call sites |
| scout_assignments | 0 | 0 | dead — no call sites |
| scout_assignment_audit | 0 | 0 | dead — no call sites |
| scout_assignment_players | 0 | 0 | dead — no call sites |

Frontend spot-check suggests the backend's Pydantic response models
already decouple `frontend/src/` from raw legacy column names — blast
radius looks backend-concentrated, but this isn't exhaustively verified;
each sub-project checks its own frontend coupling as it goes rather than
paying for a full upfront audit.

## Sequencing — 6 sub-projects

Ordered easiest/lowest-risk first, so the rewrite pattern is proven on
mechanical cases before the two structural ones:

1. **Delete the 4 dead tables** (`notifications`, `scout_assignments`,
   `scout_assignment_audit`, `scout_assignment_players`) — zero call
   sites, pure deletion (app_compat models + dbt sources). Bounded, no
   spec needed.
2. **Low-complexity mechanical batch** — highest-call-site passthrough
   tables (`scout_reports`, `player_list_items`, `player_lists`,
   `player_recommendations`, `scout_report_attribute_scores`,
   `scout_report_views`, `player_list_flags`, `shared_report_links`,
   `agent_profiles`, `recommendation_notes_history`, `status_history`,
   `password_reset_tokens`, `position_attributes`). Split into 1-2 PRs if
   the diff gets unwieldy.
3. **Medium-complexity identity-join tables**, individually:
   `player_information`, `player_stage_history`, `player_notes`, `users`.
4. **`matches`** — structural (internal/external fixture branching).
5. **`players`** — structural, hardest case (union-with-live-tail +
   denormalization from different source models). Last.
6. **Drop `APP_COMPAT`** entirely once nothing reads it.

Each sub-project gets its own spec → plan → implementation cycle (except
sub-project 1, which is bounded/trivial and skips the spec).

## Verification

Adapt `backend/tools/cutover_compare/` (capture API responses, diff after
a change) for the mechanical low/medium-complexity domains — cheap,
catches silent column-mapping mistakes. Add manual QA on top for
`matches`/`players`, since structural logic changes aren't fully covered
by a response diff.

## Definition of done

- Zero references to `APP_COMPAT` in `backend/main.py`.
- `dbt/models/app_compat/` deleted from the data-platform repo (or
  reduced to nothing referenced by the app).
- `read_table()`/`write_table()` helpers either removed or repointed
  directly at `CAFC_DB.CORE` with no legacy-shape branch left in them —
  decided per-sub-project as the pattern becomes concrete, starting with
  sub-project 2.
