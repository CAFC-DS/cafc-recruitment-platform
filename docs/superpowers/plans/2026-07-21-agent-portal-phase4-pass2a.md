# Agent Portal Phase 4 Pass 2a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the one dark-mode gap found in `AgentSubmitPage.tsx`/`AgentEditSubmissionPage.tsx`
during Phase 4 Pass 2a scoping — the `.agent-portal-banner` error/success message strip has no
dark-mode override, rendering as a light pastel patch on a dark page.

**Architecture:** Additive `[data-bs-theme="dark"]` CSS overrides only, no `.tsx` changes — both
pages already render entirely through already-fixed shared classes plus this one gap.

**Tech Stack:** CSS custom properties, following the established additive-dark-mode-override
pattern used throughout this engagement (e.g. `SharedReportPage.tsx`'s panel-tint fix earlier
this session).

## Global Constraints

- **Frozen, never touched:** `frontend/src/utils/colorUtils.ts`,
  `frontend/src/styles/playerLists.theme.ts`, the `getAttributeGroupColor`/
  `getPositionAttributeGroupColor` blocks in `PlayerReportModal.tsx`/`PlayerProfilePage.tsx`/
  `SharedReportPage.tsx`, `Kanban/PlayerKanbanCard.tsx`/`Kanban/CollapsiblePlayerBar.tsx`/
  `Kanban/KanbanColumn.tsx` card-state border colors, `ScoutingAssessmentModal.tsx`.
- **No new test framework** — verification is `tsc --noEmit`, CSS brace-balance check, and a
  live browser check in both themes (no component/unit test suite exists in this codebase).
- **Purely additive**: the existing light-mode `.agent-portal-banner`/
  `.agent-portal-banner-success` rules must not change at all.
- **Working directory:** all paths below are relative to
  `/Users/hashim.umarji/Desktop/CAFC/2025-26/Recruitment/Coding/NewRecruitmentPlatform-design-refresh/`.

---

## Task 1: Add dark-mode override for `.agent-portal-banner`

**Files:**
- Modify: `frontend/src/styles/professional-theme.css`

**Interfaces:** none (CSS-only, no new exports).

- [x] **Step 1: Find the existing light-mode rules**

```bash
cd frontend/src/styles
grep -n "^\.agent-portal-banner\b\|^\.agent-portal-banner\.agent-portal-banner-success" professional-theme.css
```

Confirm the current content matches (currently at approximately lines 3191-3204, confirm by
reading the actual file — line numbers may have drifted from earlier edits in this session):

```css
.agent-portal-banner {
  border-radius: 14px;
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #9f1239;
  padding: 0.85rem 1rem;
  font-size: 0.92rem;
}

.agent-portal-banner.agent-portal-banner-success {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}
```

If the content differs from this, stop and report — something changed since this plan was
written.

- [x] **Step 2: Add additive dark-mode overrides immediately after the light-mode rules**

Insert this new block right after the `.agent-portal-banner.agent-portal-banner-success` rule
(do not modify the two rules above it):

```css
[data-bs-theme="dark"] .agent-portal-banner {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
}

[data-bs-theme="dark"] .agent-portal-banner.agent-portal-banner-success {
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.12);
  color: #6ee7b7;
}
```

These rgba values are derived from `ThemeContext.tsx`'s actual dark-theme `danger`
(`#ef4444` = `rgb(239, 68, 68)`) and `success` (`#10b981` = `rgb(16, 185, 129)`) tokens — not new
colors invented for this fix. The text colors (`#fca5a5`, `#6ee7b7`) are light tints of the same
hues, chosen for readability against the translucent dark background; `#fca5a5` already appears
elsewhere in this same file (`.agent-portal-eyebrow`) as an established light-on-dark accent.

- [x] **Step 3: Verify CSS is syntactically valid**

```bash
cd /Users/hashim.umarji/Desktop/CAFC/2025-26/Recruitment/Coding/NewRecruitmentPlatform-design-refresh
python3 -c "
content = open('frontend/src/styles/professional-theme.css').read()
print('open:', content.count('{'), 'close:', content.count('}'))
"
```
Expected: the two brace counts match, and both should be exactly 4 more than before this task's
edit (two new rule blocks, one `{`/`}` pair each).

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean (CSS-only change, but confirms nothing else in the repo is broken).

- [x] **Step 4: Frozen-file diff**

```bash
cd /Users/hashim.umarji/Desktop/CAFC/2025-26/Recruitment/Coding/NewRecruitmentPlatform-design-refresh
git diff main -- frontend/src/utils/colorUtils.ts frontend/src/styles/playerLists.theme.ts
```
Expected: empty.

- [x] **Step 5: Live check in both themes**

Start the dev servers if not already running (backend on :8000 needs `backend/.env` and
`backend/keys/` copied from the main checkout — both gitignored; frontend on :3001 via
`npm start`, `PORT=3001` is baked into `package.json`).

To see the error banner: navigate to `/agents/edit-submission/999999` (or whatever the actual
edit-submission route is — check `App.tsx` for the exact path) with a non-existent/non-editable
submission id, which triggers `AgentEditSubmissionPage.tsx`'s error path
(`.agent-portal-banner` without the success modifier).

To see the success banner: `AgentSubmitPage.tsx` shows `.agent-portal-banner-success` briefly
after a successful submission, before redirecting — harder to catch live; a code-level check
that the CSS selector is correctly scoped (`.agent-portal-banner.agent-portal-banner-success`,
requiring both classes) is an acceptable substitute if timing makes the live catch impractical,
as long as the error-state banner is confirmed live in both themes.

Confirm: in dark mode, the banner reads as a translucent red-tinted (or green-tinted, if caught)
strip with light, legible text — not a light pastel patch. In light mode, confirm the banner
looks completely unchanged from before this task.

- [x] **Step 6: Commit**

```bash
git add frontend/src/styles/professional-theme.css
git commit -m "Add dark-mode override for agent-portal-banner (error/success messages)"
```
