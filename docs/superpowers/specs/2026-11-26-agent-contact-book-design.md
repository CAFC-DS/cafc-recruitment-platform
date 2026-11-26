# Agent contact book — design (read-only v1)

Status: approved 2026-11-26. Size: small change.

## Intent

Staff want one place to look up an agent's contact details (name, agency, email, phone)
and see what that agent has put forward, laid out like a contact book. Today those
details are only visible one recommendation at a time on External Recommendations.

## Goals

- A page at `/lists/agents` titled "Agent Contacts" listing every agent who has submitted a
  recommendation through the agent portal.
- Contact-book layout: A–Z by agent name, letter section headers, and an A–Z jump bar
  (letters with no agents greyed out).
- Search across name, agency and email.
- Columns: Agent, Agency, Email (`mailto:` + copy), Phone (`tel:` + copy), Recs (count), Last rec (date).
- Sortable by Agent (default, A–Z), Agency, Recs, Last rec. Letter sections and jump bar
  only show while sorted by Agent.
- Clicking an agent row expands an accordion under it showing that agent's **5 most recent**
  recommendations: Player, Position, Age, Submitted, Status (existing `SubmissionStatusBadge`, short form).
  Several rows can be open at once. Footer link: "View all N in External Recommendations"
  (or "Open in External Recommendations" when N ≤ 5), opening `/lists/external` filtered to that agent.
- Clicking email / phone / copy does not toggle the row.

## Non-goals (v1)

- Adding, editing or deleting contacts; notes; agents who never submitted.
- CSV export (explicitly dropped).
- Any database migration.

## Anti-goals

- Exposing contact details to anyone who can't already see External Recommendations.
- Agents reaching this page or its endpoints.

## Constraints

- Backend does all filtering and access control (CLAUDE.md).
- Read-only against existing tables: `agent_profiles` (USER_ID, AGENT_NAME, AGENCY, AGENT_EMAIL,
  AGENT_NUMBER) and `player_recommendations` (SUBMITTED_BY_USER_ID, AGENT_NAME, AGENCY, AGENT_EMAIL,
  AGENT_NUMBER, PLAYER_NAME, RECOMMENDED_POSITION, PLAYER_DATE_OF_BIRTH, STATUS, CREATED_AT), via `core_table(...)`.
- Visual style matches External Recommendations (`rec-queue` classes, Back to Lists link).

## Approaches considered

1. **New endpoint + new page (chosen).** One list endpoint aggregating profiles + recommendations,
   one endpoint for an agent's recent recs, one new page.
2. **Frontend-only, reuse `/internal/recommendations/filters/meta`.** Rejected: that only returns
   name labels, no email/phone/agency/counts.
3. **Load every agent's recs up front.** Rejected: the accordion fetches an agent's recs on first
   open instead, so the page stays fast as the agent count grows.

## Decided details

- **One row per agent account** — grouped by `SUBMITTED_BY_USER_ID`. Recommendations with a NULL
  submitter are excluded.
- **Contact fields:** profile value first; if the profile is missing or the field is blank, fall back
  to that field on the agent's most recent recommendation. A row whose details came from the
  fallback shows the sub-line "Details from latest rec". If no name exists anywhere, fall back to the
  user's first + last name, then username (same as the existing filters/meta query).
- **Alphabetical order:** by the name as typed (first name first) — agent names are one free-text
  field, so there's no reliable surname. Accents are ignored for ordering and for the letter
  (Lucía → L). Names not starting with A–Z go under `#` at the end.
- **Access:** admin, senior_manager, intel_reviewer — the existing `INTEL_VIEW_ROLES` set, which is
  exactly who the frontend lets onto External Recommendations (`canAccessExternalRecs`). New backend
  dependency for both endpoints; the page uses the existing `ExternalRecsRoute` guard. All other
  roles (including manager, loan_manager, scout, agent) get 403.
- **Entry points:** an "Agent Contacts" button on the Lists gateway page, and an "Agent contacts"
  link in the External Recommendations header (Intel Reviewers can't see the Lists gateway).
- **Filtered hand-off:** External Recommendations reads `?agent=<user_id>` on load, sets its agent
  filter to it (overriding the saved filter), and switches to the "All" queue.

## Left to the builder

- Exact endpoint paths/response field names (suggested: `GET /internal/agent-contacts`,
  `GET /internal/agent-contacts/{user_id}/recommendations?limit=5` returning `{ total, items }`).
- Whether search/sort run client-side (fine for the expected few hundred agents) — recommended.
- Loading / empty / error states, matching External Recommendations' wording style.

## Reference

Throwaway mockup (to be deleted before the real build):
`frontend/src/pages/AgentContactsMockupPage.tsx` at `/design/agent-contacts-mockup`.
