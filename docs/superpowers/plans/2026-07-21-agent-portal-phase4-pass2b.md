# Agent Portal Phase 4 Pass 2b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all dark-mode gaps in `AgentDashboardPage.tsx`, `AgentSubmissionDetailPage.tsx`,
and the CSS `SubmissionStatusBadge.tsx` renders through — found via full audit in Phase 4 Pass 2b
scoping (~25 CSS rule groups plus 11 inline hex values).

**Architecture:** Additive `[data-bs-theme="dark"]` CSS overrides for card backgrounds/text/muted
captions/tinted callouts, one in-place near-brand-red token correction, plus direct inline hex
swaps in the two `.tsx` files. No new components, no structural changes.

**Tech Stack:** CSS custom properties, following the established additive-dark-mode-override
pattern used throughout this engagement.

## Global Constraints

- **Frozen, never touched:** `frontend/src/utils/colorUtils.ts`,
  `frontend/src/styles/playerLists.theme.ts`, the `getAttributeGroupColor`/
  `getPositionAttributeGroupColor` blocks in `PlayerReportModal.tsx`/`PlayerProfilePage.tsx`/
  `SharedReportPage.tsx`, `Kanban/PlayerKanbanCard.tsx`/`Kanban/CollapsiblePlayerBar.tsx`/
  `Kanban/KanbanColumn.tsx` card-state border colors, `ScoutingAssessmentModal.tsx`.
- **No new test framework** — verification is `tsc --noEmit`, CSS brace-balance check, frozen-
  file diff, and a live browser check in both themes.
- **Purely additive for all dark-mode overrides**: every existing light-mode rule listed below
  must remain completely unchanged in the diff — only new `[data-bs-theme="dark"]` blocks added.
- **Scope discipline on the near-brand-red fix**: `#b32627`/`#8f1b1c` repeats at several other
  locations in `professional-theme.css` outside this plan's two files (e.g.
  `.page-lists-cafc .btn-link`). Do not touch those — only the two selectors named in Task 1
  Step 2 below.
- **Do not touch** `SubmissionStatusBadge.tsx` itself, or the badge/pill CSS classes it renders
  through (`.agent-status-badge` and its variants, `.agent-availability-*`,
  `.agent-portal-progress-item.complete`/`.current` marker states, `.agent-portal-step-chip`) —
  confirmed self-contained (own background + matching text), no dark-mode gap.
- **Working directory:** all paths below are relative to
  `/Users/hashim.umarji/Desktop/CAFC/2025-26/Recruitment/Coding/NewRecruitmentPlatform-design-refresh/`.

---

## Task 1: Dark-mode CSS overrides in `professional-theme.css`

**Files:**
- Modify: `frontend/src/styles/professional-theme.css`

**Interfaces:** none (CSS-only, no new exports).

- [ ] **Step 1: Card backgrounds + their text — additive dark-mode overrides**

Find each selector below (search by name; line numbers may have drifted since this plan was
written) and add the corresponding `[data-bs-theme="dark"]` block immediately after it. Do not
modify the existing light-mode rule.

```css
[data-bs-theme="dark"] .agent-portal-mobile-card {
  background: var(--color-surface);
  border-color: var(--color-border);
}

[data-bs-theme="dark"] .agent-portal-mobile-card-name {
  color: var(--color-text);
}

[data-bs-theme="dark"] .agent-portal-mobile-card-notes {
  background: var(--color-background);
  border-color: var(--color-border);
  color: var(--color-text);
}

[data-bs-theme="dark"] .agent-portal-mobile-card-meta dd {
  color: var(--color-text);
}

[data-bs-theme="dark"] .agent-portal-mobile-card-actions {
  border-top-color: var(--color-border);
}

[data-bs-theme="dark"] .agent-portal-stage-card {
  background: var(--color-surface);
  border-color: var(--color-border);
}

[data-bs-theme="dark"] .agent-portal-stage-title {
  color: var(--color-text);
}

[data-bs-theme="dark"] .agent-portal-submission-card {
  background: var(--color-surface);
  border-color: var(--color-border);
}

[data-bs-theme="dark"] .agent-portal-submission-title {
  color: var(--color-text);
}

[data-bs-theme="dark"] .agent-portal-submission-footer {
  border-top-color: var(--color-border);
}

[data-bs-theme="dark"] .agent-portal-process-card {
  background: var(--color-surface);
  border-color: var(--color-border);
}

[data-bs-theme="dark"] .agent-portal-progress-marker {
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text-muted);
}

[data-bs-theme="dark"] .agent-portal-progress-item.upcoming .agent-portal-progress-marker {
  background: var(--color-background);
  color: var(--color-text-muted);
}

[data-bs-theme="dark"] .agent-portal-progress-title {
  color: var(--color-text);
}

[data-bs-theme="dark"] .agent-portal-history-card {
  background: var(--color-surface);
  border-color: var(--color-border);
}

[data-bs-theme="dark"] .agent-portal-history-title {
  color: var(--color-text);
}
```

Note on `.agent-portal-stage-card`: its light-mode rule has
`background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)`. The dark override above
flattens this to a solid `var(--color-surface)` rather than inventing a dark-mode gradient — the
gradient is a light-mode-only visual refinement, not something that needs a dark equivalent.

- [ ] **Step 2: Muted caption/label text — additive dark-mode overrides**

```css
[data-bs-theme="dark"] .agent-portal-mobile-card-meta dt {
  color: var(--color-text-muted);
}

[data-bs-theme="dark"] .agent-portal-stage-step {
  color: var(--color-text-muted);
}

[data-bs-theme="dark"] .agent-portal-stage-copy {
  color: var(--color-text-muted);
}

[data-bs-theme="dark"] .agent-portal-submission-meta-item {
  color: var(--color-text-muted);
}

[data-bs-theme="dark"] .agent-portal-submission-meta-label {
  color: var(--color-text-muted);
}

[data-bs-theme="dark"] .agent-status-pill-label {
  color: var(--color-text-muted);
}
```

- [ ] **Step 3: Tinted callout boxes — additive dark-mode overrides**

```css
[data-bs-theme="dark"] .agent-portal-status-note {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.1);
  color: #fcd34d;
}

[data-bs-theme="dark"] .agent-portal-current-status-card {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.08);
}

[data-bs-theme="dark"] .agent-portal-notes-panel {
  background: rgba(193, 18, 31, 0.08);
}
```

Note: `.agent-portal-current-status-title` (the text inside `.agent-portal-current-status-card`)
is already covered by Step 1's general `color: #111827` → `var(--color-text)` sweep — no separate
rule needed here; if it wasn't included in Step 1's list, add
`[data-bs-theme="dark"] .agent-portal-current-status-title { color: var(--color-text); }` here.

`.agent-portal-notes-panel`'s `border-left: 4px solid #c1121f` accent stripe is left unchanged in
both themes — it's a saturated brand-adjacent red accent, not body text, and reads fine on both
the light and the new translucent-dark background.

- [ ] **Step 4: Near-brand-red link color — in-place edit, NOT theme-conditional**

Find:
```css
.agent-dashboard-table .btn-link {
  color: #b32627;
  font-weight: 700;
}
```
Change `color: #b32627;` to `color: var(--color-primary);`. Leave
`.agent-dashboard-table .btn-link:hover { color: #8f1b1c; }` completely unchanged.

Find:
```css
.agent-portal-mobile-card-actions .btn-link {
  color: #b32627;
  font-weight: 700;
  text-decoration: none;
  padding: 0.25rem 0.5rem;
}
```
Change `color: #b32627;` to `color: var(--color-primary);`. Leave
`.agent-portal-mobile-card-actions .btn-link:hover { color: #8f1b1c; }` completely unchanged.

**Do not touch any other `#b32627`/`#8f1b1c` occurrence in this file** — confirm you're only
editing these two specific selectors:
```bash
grep -n "b32627" frontend/src/styles/professional-theme.css
```
This should show more than 2 matches total; only change the ones under
`.agent-dashboard-table .btn-link` and `.agent-portal-mobile-card-actions .btn-link`.

- [ ] **Step 5: Verify — brace balance, tsc, frozen-file diff**

```bash
python3 -c "
content = open('frontend/src/styles/professional-theme.css').read()
print('open:', content.count('{'), 'close:', content.count('}'))
"
```
Expected: the two counts match.

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean.

```bash
cd .. && git diff main -- frontend/src/utils/colorUtils.ts frontend/src/styles/playerLists.theme.ts
```
Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/professional-theme.css
git commit -m "Add dark-mode overrides for AgentDashboardPage/AgentSubmissionDetailPage cards and callouts"
```

---

## Task 2: Inline hex swaps in `AgentDashboardPage.tsx` and `AgentSubmissionDetailPage.tsx`

**Files:**
- Modify: `frontend/src/pages/agents/AgentDashboardPage.tsx`
- Modify: `frontend/src/pages/agents/AgentSubmissionDetailPage.tsx`

**Interfaces:** none.

- [ ] **Step 1: Confirm current occurrences**

```bash
cd frontend/src
grep -n "#111827" pages/agents/AgentDashboardPage.tsx pages/agents/AgentSubmissionDetailPage.tsx
```

Expected (as of plan-writing time — confirm line numbers haven't drifted):
- `AgentDashboardPage.tsx:164` — `<div style={{ fontWeight: 700, color: '#111827' }}>{item.player_name}</div>`
- `AgentDashboardPage.tsx:171` — `<div className="agent-portal-meta" style={{ color: '#111827', maxWidth: 260 }}>`
- `AgentSubmissionDetailPage.tsx:136, 143, 150, 182, 202, 241, 263, 270, 280` — all
  `color: '#111827'` inside inline `style={{...}}` objects, most already paired with
  `className="agent-portal-meta"` or similar.

- [ ] **Step 2: Replace every occurrence**

In both files, replace every `'#111827'` with `'var(--color-text)'` in place — same string, same
position in the style object, no other changes. Do not alter any other prop in the same
`style={{...}}` object.

- [ ] **Step 3: Verify**

```bash
cd /Users/hashim.umarji/Desktop/CAFC/2025-26/Recruitment/Coding/NewRecruitmentPlatform-design-refresh
grep -c "#111827" frontend/src/pages/agents/AgentDashboardPage.tsx frontend/src/pages/agents/AgentSubmissionDetailPage.tsx
```
Expected: `0` for both files.

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean.

```bash
npx eslint src/pages/agents/AgentDashboardPage.tsx src/pages/agents/AgentSubmissionDetailPage.tsx
```
Expected: no errors, no new warnings.

```bash
cd .. && git diff main -- frontend/src/utils/colorUtils.ts frontend/src/styles/playerLists.theme.ts
```
Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/agents/AgentDashboardPage.tsx frontend/src/pages/agents/AgentSubmissionDetailPage.tsx
git commit -m "Tokenize remaining #111827 text color in AgentDashboardPage/AgentSubmissionDetailPage"
```

---

## Task 3: Live verification, both themes

**Files:** none modified — verification-only closing task.

- [ ] **Step 1: Start dev servers if not already running**

Backend (`:8000`, needs `backend/.env` + `backend/keys/` copied from the main checkout — both
gitignored):
```bash
cd backend && /Users/hashim.umarji/Desktop/CAFC/2025-26/Recruitment/Coding/NewRecruitmentPlatform/backend/venv/bin/python main.py
```
Frontend (`:3001`, `PORT=3001` baked into `package.json`):
```bash
cd frontend && npm start
```

- [ ] **Step 2: Log in as an agent, navigate to the Dashboard**

Check the table view in both light and dark mode. Resize the browser narrow (or use dev-tools
device emulation) to trigger the mobile-card responsive layout, and check that in both themes
too — this is the one view that can't be reached without a narrow viewport.

- [ ] **Step 3: Open a Submission Detail page**

Navigate to `/agents/submissions/:id` for a real submission (check the Dashboard's list for a
valid id, or check `App.tsx` for the exact route). Check in both themes: the status-journey
stage cards, the current-status hero card, the notes panel (if the submission has shared notes),
and the history card (if there's status history).

- [ ] **Step 4: Confirm no light-card-on-dark-page patches remain**

Across every view checked in Steps 2-3, in dark mode: no white/light card should be visible
sitting on the dark page background. In light mode: every view should look byte-identical to
before this plan (use `git stash` + a hard refresh to compare against pre-change if any doubt
exists, then `git stash pop`).

- [ ] **Step 5: Update the design-system doc**

Append a short entry to `docs/DESIGN_SYSTEM_REFRESH.md` under the Phase 4 section, following the
same style as the Pass 1 and Pass 2a entries, summarizing what was fixed and confirming live
verification.

```bash
git add docs/DESIGN_SYSTEM_REFRESH.md
git commit -m "Record Phase 4 Pass 2b completion"
```
