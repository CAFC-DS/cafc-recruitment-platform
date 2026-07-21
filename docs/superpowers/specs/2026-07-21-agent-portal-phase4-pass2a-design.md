# Phase 4 Pass 2a: agent-portal-banner dark-mode fix

## Context

First sub-pass of Phase 4 Pass 2 (per the user's chosen sequencing: simple pages first, then
`AgentDashboardPage.tsx`/`AgentSubmissionDetailPage.tsx`/`SubmissionStatusBadge.tsx`, then
`RecommendationForm.tsx` last as its own pass).

Full audit of `AgentSubmitPage.tsx` and `AgentEditSubmissionPage.tsx` (the two files in scope for
this sub-pass) found:
- Zero inline hardcoded hex colors in either file.
- Every class either page renders through is already dark-mode-fixed from Phase 4 Pass 1:
  `.agent-portal-card`, `.agent-portal-card-body`, `.agent-portal-empty`,
  `.agent-portal-button-secondary`.
- One gap: `.agent-portal-banner` / `.agent-portal-banner-success` (the error/success message
  strip both pages use for load/submit feedback) has no dark-mode override. Its light-mode
  values are fixed pastel backgrounds with dark-tinted text:
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
  In dark mode this renders as a light patch sitting on the dark page — the same class of bug
  already fixed this session for `SharedReportPage.tsx`'s Strengths/Areas-for-Improvement
  panels (translucent rgba tint instead of a solid light pastel).

## Scope

**Files:**
- Modify: `frontend/src/styles/professional-theme.css` only. No `.tsx` file changes — neither
  `AgentSubmitPage.tsx` nor `AgentEditSubmissionPage.tsx` needs touching, since both already
  render entirely through shared, already-fixed classes plus this one banner gap.

**Frozen, not touched:** `colorUtils.ts`, `playerLists.theme.ts`, the `getAttributeGroupColor`
blocks, Kanban card-state border colors, `ScoutingAssessmentModal.tsx` (standing constraint,
unaffected by this sub-pass regardless).

## Design

Additive `[data-bs-theme="dark"]` overrides, following the exact precedent already established
for `SharedReportPage.tsx`'s panels earlier this session: translucent rgba tints derived from the
dark theme's actual `danger`/`success` token values (`ThemeContext.tsx`: dark `danger` =
`#ef4444` / `rgb(239, 68, 68)`, dark `success` = `#10b981` / `rgb(16, 185, 129)`), not new
made-up colors.

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

Text colors (`#fca5a5` light-red, `#6ee7b7` light-green) are light enough to read on the dark
translucent background while still clearly reading as "error"/"success" — same approach as the
existing `.agent-portal-eyebrow` (`#fca5a5`) already used elsewhere in this file for light text
on a dark surface, so this isn't a new color introduced to the palette.

Light-mode rules are completely untouched — purely additive, verified by diff and a live
light/dark toggle check.

## Verification

- `git diff main -- <frozen files>` — empty (unaffected by a CSS-only, unrelated-class change,
  but checked anyway per standing practice).
- CSS brace-balance check.
- Live check in both themes: trigger the error banner (e.g. navigate to
  `AgentEditSubmissionPage.tsx` for a non-existent/non-editable submission id to hit the error
  path) and the success banner (submit a recommendation successfully, or inspect
  `AgentSubmitPage.tsx`'s success-banner render path) in both light and dark mode.
