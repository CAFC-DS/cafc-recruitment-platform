# Agent Contact Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only "Agent Contacts" page at `/lists/agents`: an A–Z contact book of every agent who has submitted, with an accordion of each agent's 5 latest recs.

**Architecture:** Two new read-only FastAPI endpoints in `backend/main.py` (list + per-agent recent recs), with the contact-merging logic as a pure function in a new `backend/agent_contacts.py`. One new React page that fetches the list once, searches/sorts/groups client-side, and fetches an agent's recs the first time their row opens. External Recommendations gains a `?agent=<id>` hand-off.

**Tech Stack:** Python/FastAPI + Snowflake (pytest, `TestClient`, mocked cursor); React/TypeScript + react-bootstrap + lucide-react (Jest + Testing Library).

**Spec:** `docs/superpowers/specs/2026-11-26-agent-contact-book-design.md`

## Global Constraints

- Branch: start a fresh branch `feature/agent-contact-book` from `origin/cutover/full` (PRs target cutover/full) (use a worktree — the current checkout has unrelated uncommitted work on `feature/agent-recs-list-stage`).
- Access: both endpoints allow only `INTEL_VIEW_ROLES` (admin, senior_manager, intel_reviewer); everyone else 403. Page uses `ExternalRecsRoute`.
- Read-only: no migrations, no writes. Tables via `core_table('agent_profiles')`, `core_table('player_recommendations')`, `core_table('users')`.
- Exclude recommendations with `SUBMITTED_BY_USER_ID IS NULL`.
- Copy (exact): page title "Agent Contacts"; subtitle "Everyone who has recommended a player through the agent portal."; fallback sub-line "Details from latest rec"; footer links "View all {N} in External Recommendations" (N > 5) / "Open in External Recommendations" (N ≤ 5); search placeholder "Search name, agency or email".
- Visual style: reuse `rec-queue` classes from `ExternalRecommendationsListPage.css`, as the mockup does.
- No CSV export.

## Review Focus

1. Agent has a profile but its email/phone/agency is blank → that field falls back to their latest rec, row shows "Details from latest rec" (Task 1 test `test_blank_profile_field_falls_back_to_latest_rec`).
2. Names starting with an accent, lowercase letter, digit or symbol → accents fold (Lucía → L), lowercase upper-cases, anything else goes under `#` at the end (Task 3 test `groups names by folded first letter with # last`).
3. A manager, loan_manager, scout or agent calls either endpoint → 403 (Task 1 and Task 2 role tests).
4. Arriving at External Recommendations via `?agent=` when a different agent filter was saved → URL wins, queue switches to "All" (Task 4 test).
5. Search matches nothing → "No agents match that search." row, jump bar letters all greyed (Task 3 test `shows empty state when search matches nothing`).

---

## File Structure

- Create `backend/agent_contacts.py` — `merge_contact(...)` pure function: profile-first, latest-rec fallback, user-name fallback.
- Modify `backend/main.py` — `require_agent_contacts_viewer` dependency, `AgentContactResponse` / `AgentContactRecResponse` / `AgentContactRecsResponse` models, two endpoints.
- Create `backend/tests/test_agent_contacts.py`.
- Create `frontend/src/types/agentContacts.ts`, `frontend/src/services/agentContactsService.ts`.
- Create `frontend/src/utils/agentContactsGrouping.ts` — `contactLetter`, `compareContacts`.
- Create `frontend/src/pages/AgentContactsPage.tsx` (+ `.test.tsx`).
- Modify `frontend/src/App.tsx` — route `/lists/agents`; remove mockup route + import.
- Delete `frontend/src/pages/AgentContactsMockupPage.tsx` (only exists in the original checkout — make sure it isn't carried over).
- Modify `frontend/src/pages/ListsGatewayPage.tsx`, `frontend/src/pages/ExternalRecommendationsListPage.tsx` (+ its test).

---

### Task 1: Backend — agent contacts list endpoint

**Files:**
- Create: `backend/agent_contacts.py`
- Modify: `backend/main.py` (guard next to `require_recs_viewer` ~line 3546; endpoint next to `/internal/recommendations/filters/meta` ~line 4832)
- Test: `backend/tests/test_agent_contacts.py`

**Interfaces:**
- Produces: `GET /internal/agent-contacts` → `List[AgentContactResponse]`, fields: `agent_user_id: int`, `name: str`, `agency: Optional[str]`, `email: Optional[str]`, `phone: Optional[str]`, `rec_count: int`, `last_rec_at: Optional[datetime]`, `details_from_latest_rec: bool`. Unordered (frontend sorts).
- Produces: `require_agent_contacts_viewer(current_user) -> User` (reused by Task 2).
- Produces: `agent_contacts.merge_contact(profile: Optional[dict], latest: dict, user: dict) -> tuple[dict, bool]` — each dict has keys `name, agency, email, phone` (user dict: `firstname, lastname, username`); returns merged `{name, agency, email, phone}` and whether any field used `latest`.

- [ ] **Step 1: Write failing tests** in `backend/tests/test_agent_contacts.py`, using the `test_recommendation_queue.py` fixture pattern (override `get_current_user`, patch `get_snowflake_connection`, `validate_recommendation_schema_ready`).

```python
def test_profile_values_win():
    merged, from_rec = merge_contact(
        {"name": "Sam Hartley", "agency": "Northpoint", "email": "sam@np.example", "phone": "+44 1"},
        {"name": "S H", "agency": "Old", "email": "old@x.example", "phone": "+44 9"},
        {"firstname": "Sam", "lastname": "Hartley", "username": "sam"})
    assert merged == {"name": "Sam Hartley", "agency": "Northpoint", "email": "sam@np.example", "phone": "+44 1"}
    assert from_rec is False

def test_blank_profile_field_falls_back_to_latest_rec():
    merged, from_rec = merge_contact(
        {"name": "Sam Hartley", "agency": "  ", "email": "sam@np.example", "phone": None},
        {"name": "x", "agency": "Northpoint", "email": "x", "phone": "+44 9"}, {...})
    assert merged["agency"] == "Northpoint" and merged["phone"] == "+44 9"
    assert from_rec is True

def test_no_profile_uses_latest_rec():           # profile=None → all from latest, from_rec True
def test_no_name_anywhere_uses_user_name():      # name blank in both → "First Last"; if those blank → username
def test_list_endpoint_shapes_rows(client):      # mocked fetchall row → JSON fields above, rec_count/last_rec_at passed through
def test_list_excludes_null_submitter(client):   # executed SQL contains "SUBMITTED_BY_USER_ID IS NOT NULL"
@pytest.mark.parametrize("role", ["manager", "loan_manager", "scout", "agent"])
def test_list_forbidden_roles(client, role):     # → 403
@pytest.mark.parametrize("role", ["admin", "senior_manager", "intel_reviewer"])
def test_list_allowed_roles(client, role):       # → 200
```

- [ ] **Step 2: Run** `cd backend && pytest tests/test_agent_contacts.py -v` — Expected: FAIL (`ModuleNotFoundError: agent_contacts`).

- [ ] **Step 3: Implement `merge_contact`** in `backend/agent_contacts.py`. Blank = `None` or whitespace-only. `from_rec` is True if any of agency/email/phone/name came from `latest`. Strip values.

- [ ] **Step 4: Implement guard + endpoint** in `main.py`. `require_agent_contacts_viewer` raises 403 "Agent contacts access required" unless `role in INTEL_VIEW_ROLES`. Endpoint decorated `@offload_read`, calls `validate_recommendation_schema_ready()`, one query:

```sql
WITH recs AS (
  SELECT SUBMITTED_BY_USER_ID AS UID, AGENT_NAME, AGENCY, AGENT_EMAIL, AGENT_NUMBER, CREATED_AT,
         ROW_NUMBER() OVER (PARTITION BY SUBMITTED_BY_USER_ID ORDER BY CREATED_AT DESC, ID DESC) AS RN,
         COUNT(*) OVER (PARTITION BY SUBMITTED_BY_USER_ID) AS REC_COUNT,
         MAX(CREATED_AT) OVER (PARTITION BY SUBMITTED_BY_USER_ID) AS LAST_REC_AT
  FROM {pr} WHERE SUBMITTED_BY_USER_ID IS NOT NULL)
SELECT r.UID, ap.USER_ID, ap.AGENT_NAME, ap.AGENCY, ap.AGENT_EMAIL, ap.AGENT_NUMBER,
       r.AGENT_NAME, r.AGENCY, r.AGENT_EMAIL, r.AGENT_NUMBER,
       u.FIRSTNAME, u.LASTNAME, u.USERNAME, r.REC_COUNT, r.LAST_REC_AT
FROM recs r
LEFT JOIN {agent_profiles} ap ON ap.USER_ID = r.UID
LEFT JOIN {users} u ON u.ID = r.UID
WHERE r.RN = 1
```

Profile dict is `None` when `ap.USER_ID` is NULL; map each row through `merge_contact`.

- [ ] **Step 5: Run** `pytest tests/test_agent_contacts.py -v` — Expected: all PASS. Also `pytest tests/test_recommendation_queue.py -v` still passes.

- [ ] **Step 6: Commit** `git add backend/agent_contacts.py backend/main.py backend/tests/test_agent_contacts.py && git commit -m "Add read-only agent contacts endpoint"`

---

### Task 2: Backend — an agent's recent recommendations

**Files:**
- Modify: `backend/main.py` (directly after Task 1's endpoint)
- Test: `backend/tests/test_agent_contacts.py`

**Interfaces:**
- Consumes: `require_agent_contacts_viewer` (Task 1).
- Produces: `GET /internal/agent-contacts/{user_id}/recommendations?limit=5` → `AgentContactRecsResponse { total: int, items: List[AgentContactRecResponse] }`; item fields `id: int`, `player_name: str`, `recommended_position: Optional[str]`, `player_date_of_birth: Optional[date]`, `submitted_at: datetime` (CREATED_AT), `status: str`. `limit` default 5, clamped to 1–20. Items newest first (`CREATED_AT DESC, ID DESC`).

- [ ] **Step 1: Write failing tests**

```python
def test_recent_recs_newest_first_and_limited(client):
    # cursor.fetchone → (22,), fetchall → 5 rows
    resp = client("/internal/agent-contacts/7/recommendations")
    assert resp.status_code == 200 and resp.json()["total"] == 22 and len(resp.json()["items"]) == 5
    sql, params = <the LIMIT query>.args
    assert "SUBMITTED_BY_USER_ID = %s" in sql and "ORDER BY CREATED_AT DESC, ID DESC" in sql
    assert params == (7, 5)

def test_recent_recs_limit_clamped(client):        # ?limit=500 → params[-1] == 20; ?limit=0 → 1
def test_recent_recs_unknown_agent_is_empty(client):  # total 0, items [] → 200 {"total": 0, "items": []}
@pytest.mark.parametrize("role", ["manager", "loan_manager", "scout", "agent"])
def test_recent_recs_forbidden_roles(client, role):   # → 403
```

- [ ] **Step 2: Run** `pytest tests/test_agent_contacts.py -k recent -v` — Expected: FAIL (404).
- [ ] **Step 3: Implement** the endpoint: a `COUNT(*)` query plus a `SELECT ID, PLAYER_NAME, RECOMMENDED_POSITION, PLAYER_DATE_OF_BIRTH, CREATED_AT, STATUS ... LIMIT %s` query, both parameterised on `user_id`.
- [ ] **Step 4: Run** `pytest tests/test_agent_contacts.py -v` — Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -am "Add agent contacts recent recommendations endpoint"`

---

### Task 3: Frontend — Agent Contacts page

**Files:**
- Create: `frontend/src/types/agentContacts.ts`, `frontend/src/services/agentContactsService.ts`, `frontend/src/utils/agentContactsGrouping.ts`, `frontend/src/pages/AgentContactsPage.tsx`, `frontend/src/pages/AgentContactsPage.test.tsx`
- Modify: `frontend/src/App.tsx` (lazy import + `<Route path="/lists/agents" element={<ExternalRecsRoute><AgentContactsPage /></ExternalRecsRoute>} />`; ensure no mockup route/import)

**Interfaces:**
- Consumes: Task 1 and Task 2 response shapes, mirrored as TS types `AgentContact`, `AgentContactRec`, `AgentContactRecs` (snake_case field names identical to the backend).
- Produces: `agentContactsService.list(): Promise<AgentContact[]>`, `agentContactsService.recentRecs(userId: number, limit = 5): Promise<AgentContactRecs>` (via `axiosInstance`, like `internalRecommendationsService`).
- Produces: `contactLetter(name: string): string` (A–Z or `'#'`), `compareContacts(key: 'name'|'agency'|'rec_count'|'last_rec_at', dir: 1|-1)` comparator.

Behaviour to build (the mockup at `frontend/src/pages/AgentContactsMockupPage.tsx` in the original checkout is the visual reference — copy its layout, not its fake data):
- Default sort `name` asc. Name/agency compare with `localeCompare(..., 'en', { sensitivity: 'base' })`; blank agency sorts last in asc. Recs/Last rec default desc on first click; clicking the active header flips direction.
- Letter section rows + A–Z jump bar (plus `#` if present) only when sort key is `name`.
- Row click toggles an accordion (several open at once, `aria-expanded` on the row). First open calls `recentRecs(id)`; result cached in state so re-opening doesn't refetch. Panel shows a spinner while loading and "Couldn't load recommendations." on error.
- Panel columns: Player, Position, Age (from `player_date_of_birth`, reusing the age calculation External Recommendations uses — move it to `utils/` if it's local to that page), Submitted (`en-GB` date), Status (`<SubmissionStatusBadge status short />`). Footer link to `/lists/external?agent={agent_user_id}` with the copy from Global Constraints using `rec_count`.
- Email `mailto:`, phone `tel:` (spaces stripped), copy buttons; all `stopPropagation` so they don't toggle the row. Blank values render `—`.
- Counter "{n} agents"; empty search → "No agents match that search."; list load failure → `alert alert-danger` like External Recommendations.

- [ ] **Step 1: Write failing tests** in `AgentContactsPage.test.tsx` (mock the service + `useCurrentUser` like `ExternalRecommendationsListPage.test.tsx`):

```ts
test('contactLetter folds accents, upper-cases, and buckets non-letters', () => {
  expect(contactLetter('Lucía Ferrer')).toBe('L');
  expect(contactLetter('émile')).toBe('E');
  expect(contactLetter('3 Lions Mgmt')).toBe('#');
});
test('lists agents A–Z with letter sections', ...)            // rows in order Ana, Daniel, Lucía; section rows "A","D","L"
test('groups names by folded first letter with # last', ...)  // '#' section after 'Z'-range rows
test('shows "Details from latest rec" only when flagged', ...)
test('sorting by Recs hides letter sections and orders desc', ...)
test('search filters by agency and email', ...)
test('shows empty state when search matches nothing', ...)    // "No agents match that search."
test('opening a row fetches recs once and shows them', ...)   // recentRecs called with (7, 5) once across open/close/open
test('footer says "View all 22 in External Recommendations" and links to /lists/external?agent=7', ...)
test('clicking an email link does not open the row', ...)
```

- [ ] **Step 2: Run** `cd frontend && CI=true npx react-scripts test AgentContactsPage --watchAll=false` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** types, service, grouping utils, page, and route.
- [ ] **Step 4: Run** the same command — Expected: all PASS. Then `npx tsc --noEmit -p .` — Expected: no errors.
- [ ] **Step 5: Commit** `git add frontend/src && git commit -m "Add Agent Contacts page"`

---

### Task 4: Entry points and filtered hand-off

**Files:**
- Modify: `frontend/src/pages/ListsGatewayPage.tsx` (add an "Agent Contacts" card/button alongside the External one, same markup pattern, `to="/lists/agents"`)
- Modify: `frontend/src/pages/ExternalRecommendationsListPage.tsx` (header: "Agent contacts" link next to "Back to Lists", same `rec-queue-back` class, lucide `BookUser` icon; read `?agent=`)
- Test: `frontend/src/pages/ExternalRecommendationsListPage.test.tsx`

**Interfaces:**
- Consumes: link format `/lists/external?agent={agent_user_id}` (Task 3).

- [ ] **Step 1: Write failing tests** in `ExternalRecommendationsListPage.test.tsx`:

```ts
test('?agent= sets the agent filter and the All queue, overriding saved filters', async () => {
  localStorage.setItem('external-recs:filters', JSON.stringify({ ...savedDefaults, agent_user_id: '99', queue: 'needs_decision' }));
  render(<MemoryRouter initialEntries={['/lists/external?agent=7']}>...</MemoryRouter>);
  await waitFor(() => expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ agent_user_id: '7' })));
  expect(service.list).toHaveBeenLastCalledWith(expect.not.objectContaining({ status: 'Submitted,Under Review' }));
});
test('header links to Agent contacts', ...) // link href "/lists/agents"
```
(Check how `usePersistentState` keys/serialises before seeding localStorage, and how the "needs decision" queue maps to the `status` param, and match the assertion to that.)

- [ ] **Step 2: Run** `CI=true npx react-scripts test ExternalRecommendationsListPage --watchAll=false` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement**: on mount, if `useSearchParams().get('agent')` is set, `setFilters(current => ({ ...current, agent_user_id: agent, queue: 'all', status: '', page: 1 }))`, then remove the param with `setSearchParams({}, { replace: true })` so later filter changes aren't overridden. Add the header link and the gateway card.
- [ ] **Step 4: Run** both page test files and `npx tsc --noEmit -p .` — Expected: all PASS, no type errors.
- [ ] **Step 5: Manual check** (frontend + backend running, logged in as admin): `/lists` shows the card → `/lists/agents` lists real agents A–Z → open a row → footer link lands on External Recommendations filtered to that agent. Then log in as a scout/manager: `/lists/agents` redirects home and `GET /internal/agent-contacts` returns 403.
- [ ] **Step 6: Commit** `git commit -am "Link Agent Contacts from Lists and External Recommendations"`

---

## Cleanup (before opening the PR)

- [ ] In the original checkout, delete `frontend/src/pages/AgentContactsMockupPage.tsx` and revert its two lines in `frontend/src/App.tsx` (`git diff frontend/src/App.tsx` should then show nothing from the mockup).
