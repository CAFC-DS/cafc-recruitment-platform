# Agent Contact Scores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Agent averages (performance, data score) on the Agent Contacts list and per-player scores in the accordion.

**Architecture:** Backend reads per-rec scores via `build_recommendation_select()` as a subquery; a pure
`agent_contacts.summarise_scores(...)` de-duplicates players and averages per agent. Frontend adds
two columns in each table.

**Spec:** `docs/superpowers/specs/2026-11-26-agent-contact-scores-design.md`

## Global Constraints

- Headers exactly: "Average performance", "Average data score", "Performance", "Data score".
- Performance hidden (null) for intel_reviewer; data score null unless admin/senior_manager.
- Base `origin/cutover/full`; PR targets cutover/full.

## Review Focus

1. Same player recommended twice by one agent → counted once in both averages (Task 1 test).
2. Player with a perf score but no data score (or vice versa) → counts only towards the score it has (Task 1 test).
3. Intel Reviewer calls either endpoint → no performance or data values (Task 1/2 tests); page hides the columns (Task 3 test).
4. Senior manager sorts by Average data score with some agents unscored → unscored last (Task 3 test).
5. Agent with no scored players → "—", not 0 (Task 3 test).

---

### Task 1: Backend — agent averages on the list endpoint

**Files:** `backend/agent_contacts.py`, `backend/main.py`, `backend/tests/test_agent_contacts.py`

**Interfaces:**
- Produces `summarise_scores(rows: Iterable[tuple], data_lookup: Callable[[Any], Optional[float]] | None, include_perf: bool) -> Dict[int, dict]`.
  Row tuple: `(submitter_id, player_key, avg_perf, external_player_id)`; result per submitter:
  `{"avg_performance_score", "performance_scored_count", "avg_data_score", "data_scored_count"}`.
- `AgentContactResponse` gains those four fields (Optional / int, default None/0).

- [ ] Write failing tests: dedupe, partial scores, no scores → None/0, include_perf=False → perf None, data_lookup None → data None; endpoint attaches averages; intel_reviewer gets nulls.
- [ ] Run → FAIL. Implement. Run → PASS. Commit.

### Task 2: Backend — scores on an agent's recent recs

**Files:** `backend/main.py`, tests.
- Items gain `avg_performance_score: Optional[float]`, `data_score: Optional[dict]`; query selects from `build_recommendation_select()` subquery.
- [ ] Tests: values passed through for admin; intel_reviewer gets nulls; manager-level gating unchanged. RED → GREEN → commit.

### Task 3: Frontend — columns

**Files:** `frontend/src/types/agentContacts.ts`, `utils/agentContactsGrouping.ts` (sort keys), `pages/AgentContactsPage.tsx`, tests.
- [ ] Tests: headers exact; chips render; "—" for missing; sort by Average data score desc with nulls last; Intel Reviewer sees no score columns; tooltip basis text.
- [ ] RED → GREEN → full suite + tsc → commit.

### Finish

- [ ] Live Snowflake check of both endpoints; final review; PR → merge → promote; remove mockup worktree + launch entry.
