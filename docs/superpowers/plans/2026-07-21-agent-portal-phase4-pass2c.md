# Agent Portal Phase 4 Pass 2c Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all dark-mode gaps in `RecommendationForm.tsx`'s bespoke UI — the custom
player-search dropdown, custom multi-select, wage-basis toggle, and manual-entry toggle — the
last piece of Phase 4 Pass 2.

**Architecture:** Additive `[data-bs-theme="dark"]` CSS overrides for dropdown/menu surfaces,
hover/active tints, and one confirmation-card tint, plus two in-place near-brand-red token
corrections. No `.tsx` changes — the file has zero inline hardcoded colors.

**Tech Stack:** CSS custom properties, following the established additive-dark-mode-override
pattern used throughout this engagement.

## Global Constraints

- **Frozen, never touched:** `frontend/src/utils/colorUtils.ts`,
  `frontend/src/styles/playerLists.theme.ts`, the `getAttributeGroupColor`/
  `getPositionAttributeGroupColor` blocks in `PlayerReportModal.tsx`/`PlayerProfilePage.tsx`/
  `SharedReportPage.tsx`, `Kanban/PlayerKanbanCard.tsx`/`Kanban/CollapsiblePlayerBar.tsx`/
  `Kanban/KanbanColumn.tsx` card-state border colors, `ScoutingAssessmentModal.tsx`.
- **No new test framework** — verification is `tsc --noEmit`, CSS brace-balance check, frozen-
  file diff, and a live browser check in both themes where test data/environment permits.
- **Purely additive for all dark-mode overrides**: every existing light-mode rule listed below
  must remain completely unchanged in the diff.
- **Do not touch** `.agent-player-selected-icon` or `.agent-wage-basis-option.active` — confirmed
  self-contained (solid background + matching text), no fix needed.
- **Working directory:** all paths below are relative to
  `/Users/hashim.umarji/Desktop/CAFC/2025-26/Recruitment/Coding/NewRecruitmentPlatform-design-refresh/`.

---

## Task 1: Dark-mode CSS overrides for `RecommendationForm.tsx`'s bespoke UI

**Files:**
- Modify: `frontend/src/styles/professional-theme.css`

**Interfaces:** none (CSS-only, no new exports).

- [ ] **Step 1: Dropdown/menu/toggle surfaces — additive dark-mode overrides**

Find each selector below (search by name; line numbers may have drifted since this plan was
written) and add the corresponding `[data-bs-theme="dark"]` block immediately after it. Do not
modify the existing light-mode rule.

```css
[data-bs-theme="dark"] .agent-select-trigger {
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}

[data-bs-theme="dark"] .agent-select-chevron {
  color: var(--color-text-muted);
}

[data-bs-theme="dark"] .agent-select-menu {
  background: var(--color-surface);
  border-color: var(--color-border);
}

[data-bs-theme="dark"] .agent-select-option {
  background: var(--color-surface);
  border-bottom-color: var(--color-border);
  color: var(--color-text);
}

[data-bs-theme="dark"] .agent-wage-basis-toggle {
  background: var(--color-background);
  border-color: var(--color-border);
}

[data-bs-theme="dark"] .agent-wage-basis-option {
  color: var(--color-text-muted);
}

[data-bs-theme="dark"] .agent-wage-basis-option:hover,
[data-bs-theme="dark"] .agent-wage-basis-option:focus {
  color: var(--color-text);
  border-color: var(--color-border);
}

[data-bs-theme="dark"] .agent-player-search-menu {
  background: var(--color-surface);
  border-color: var(--color-border);
}

[data-bs-theme="dark"] .agent-player-search-option {
  background: var(--color-surface);
  border-bottom-color: var(--color-border);
  color: var(--color-text);
}

[data-bs-theme="dark"] .agent-player-search-option-name {
  color: var(--color-text);
}

[data-bs-theme="dark"] .agent-player-search-option-meta {
  color: var(--color-text-muted);
}

[data-bs-theme="dark"] .agent-player-search-divider {
  color: var(--color-text-muted);
  background: var(--color-background);
  border-top-color: var(--color-border);
  border-bottom-color: var(--color-border);
}

[data-bs-theme="dark"] .agent-player-search-divider strong {
  color: var(--color-text);
}

[data-bs-theme="dark"] .agent-player-search-suggestion {
  background: var(--color-background);
}

[data-bs-theme="dark"] .agent-player-selected-name {
  color: var(--color-text);
}

[data-bs-theme="dark"] .agent-manual-toggle {
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}
```

- [ ] **Step 2: Hover/active tints on select & search options**

```css
[data-bs-theme="dark"] .agent-select-option:hover,
[data-bs-theme="dark"] .agent-select-option.active,
[data-bs-theme="dark"] .agent-player-search-option:hover,
[data-bs-theme="dark"] .agent-player-search-option.active {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}

[data-bs-theme="dark"] .agent-player-search-suggestion:hover,
[data-bs-theme="dark"] .agent-player-search-suggestion.active {
  background: rgba(239, 68, 68, 0.15);
}
```

- [ ] **Step 3: "Player selected" confirmation card tint**

```css
[data-bs-theme="dark"] .agent-player-selected-card {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.35);
}

[data-bs-theme="dark"] .agent-player-selected-meta,
[data-bs-theme="dark"] .agent-player-selected-change {
  color: #6ee7b7;
}
```

Do not touch `.agent-player-selected-change:hover`'s existing
`background: rgba(16, 185, 129, 0.12)` — it's already theme-agnostic (same value works in both
themes), no dark-mode override needed for that specific rule.

- [ ] **Step 4: Neutral score badge**

```css
[data-bs-theme="dark"] .agent-player-score-badge {
  background: var(--color-border);
  color: var(--color-text);
}
```

- [ ] **Step 5: Two near-brand-red accents — in-place edits, NOT theme-conditional**

Find:
```css
.agent-select-trigger.open,
.agent-select-trigger:focus {
  outline: none;
  border-color: #cc0000;
  box-shadow: 0 0 0 4px rgba(204, 0, 0, 0.1);
}
```
Change `border-color: #cc0000;` to `border-color: var(--color-primary);`. Leave
`box-shadow: 0 0 0 4px rgba(204, 0, 0, 0.1);` completely unchanged — this exact rgba focus-ring
pattern repeats at 6 other untouched locations in this file, so changing it here would make this
one selector inconsistent with the file's established convention, not more consistent.

Find:
```css
.agent-manual-toggle input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: #b32627;
  cursor: pointer;
}
```
Change `accent-color: #b32627;` to `accent-color: var(--color-primary);`.

- [ ] **Step 6: Verify — brace balance, tsc, frozen-file diff**

```bash
python3 -c "
content = open('frontend/src/styles/professional-theme.css').read()
print('open:', content.count('{'), 'close:', content.count('}'))
"
```
Expected: the two counts match, and both increased by exactly 21 from before this task (Steps
1-4 add 21 new rule blocks total: 16 in Step 1, 2 in Step 2, 2 in Step 3, 1 in Step 4 — some
blocks share one body across multiple selectors, e.g. Step 2's four-selector hover/active rule,
which still counts as one `{`/`}` pair). Step 5's in-place edits add zero new braces.

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean.

```bash
cd .. && git diff main -- frontend/src/utils/colorUtils.ts frontend/src/styles/playerLists.theme.ts
```
Expected: empty.

- [ ] **Step 7: Confirm scope discipline on the two in-place edits**

```bash
grep -n "cc0000" frontend/src/styles/professional-theme.css | wc -l
grep -n "b32627" frontend/src/styles/professional-theme.css | wc -l
```
Both counts should be exactly 1 less than before this task (only the two named selectors
changed; every other `#cc0000`/`#b32627` occurrence in the file — there are several, all outside
this plan's scope — must remain untouched).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/styles/professional-theme.css
git commit -m "Add dark-mode overrides for RecommendationForm's custom dropdowns, search, and toggles"
```

---

## Task 2: Live verification, both themes

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

- [ ] **Step 2: Log in as an agent, navigate to Submit a Player**

Check in both light and dark mode:
- Type a partial player name into the search box — check the dropdown surface, hover states on
  results, and the "did you mean" divider/suggestions styling if any appear
- Open the "Recommended Position" (or any) custom multi-select dropdown — check the trigger,
  menu, and option hover/active states
- Toggle the "Other (Manual Entry)" checkbox — check its chip styling in both states
- Use the Wage Basis toggle (Gross/Net) — check both the inactive and active option styling
- If a player can actually be selected in the test environment, check the green "player
  selected" confirmation card

- [ ] **Step 3: Confirm no light-patch-on-dark-page issues remain**

In dark mode: no white/light dropdown, menu, or card should be visible sitting on the dark page.
In light mode: every element checked should look byte-identical to before this plan.

If test data or environment constraints prevent exercising a particular interactive state live
(e.g. no players available to search, as happened with some of Pass 2b's views), rely on Task
1's review (diff-level verification) for that specific state and say so plainly in the design-doc
entry below — don't claim a live check that didn't happen.

- [ ] **Step 4: Update the design-system doc**

Append a short entry to `docs/DESIGN_SYSTEM_REFRESH.md` under the Phase 4 section, following the
same style as the Pass 1/2a/2b entries. Since this closes out all of Phase 4 Pass 2, also note
that Phase 4 Pass 2 (all three sub-passes) is now complete, and only Phase 5 (cleanup &
verification) remains on the overall design-system-refresh plan.

```bash
git add docs/DESIGN_SYSTEM_REFRESH.md
git commit -m "Record Phase 4 Pass 2c completion"
```
