# Phase 4 Pass 2b: AgentDashboardPage / AgentSubmissionDetailPage / SubmissionStatusBadge

## Context

Second sub-pass of Phase 4 Pass 2 (sequencing per the user: 2a simple pages — done — then this,
then `RecommendationForm.tsx` alone as 2c).

Full audit of `AgentDashboardPage.tsx`, `AgentSubmissionDetailPage.tsx`, and
`SubmissionStatusBadge.tsx` found:
- 11 inline hardcoded `#111827` hex values across the two pages (2 in `AgentDashboardPage.tsx`,
  9 in `AgentSubmissionDetailPage.tsx`) — all simple text-color swaps.
- ~25 CSS rule groups in `professional-theme.css`, consumed by these three files, with no
  dark-mode treatment. These fall into four patterns, consistent with fixes already made
  elsewhere in this engagement:
  1. White/light card backgrounds + the dark text inside them
  2. Muted caption/label text
  3. Tinted callout boxes (status note, current-status hero, notes panel)
  4. One near-brand-red link color
- Left alone, on purpose: `SubmissionStatusBadge.tsx`'s actual status/availability pills and the
  progress-marker's "complete"/"current" states — self-contained pastel-or-saturated shapes with
  their own background+text pairing, same reasoning already applied to flag/grade badges
  elsewhere in the app (they read fine in either theme without modification).

## Scope

**Files:**
- Modify: `frontend/src/pages/agents/AgentDashboardPage.tsx` (2 inline hex → `var(--color-text)`)
- Modify: `frontend/src/pages/agents/AgentSubmissionDetailPage.tsx` (9 inline hex →
  `var(--color-text)`)
- Modify: `frontend/src/styles/professional-theme.css` (all CSS listed below)
- No changes to `SubmissionStatusBadge.tsx` itself (its badges are self-contained, no dark-mode
  gap) — but see the CSS list below for `.agent-status-pill-label`, one small text-only class it
  renders through that DOES need a fix (a caption label, not a badge).

**Frozen, not touched:** `colorUtils.ts`, `playerLists.theme.ts`, the `getAttributeGroupColor`
blocks, Kanban card-state border colors, `ScoutingAssessmentModal.tsx`.

## Design

### Pattern 1 — card backgrounds + their text

Additive `[data-bs-theme="dark"]` overrides, `var(--color-surface)` background /
`var(--color-border)` border / `var(--color-text)` text, following the exact precedent from
Pass 1's `.agent-portal-card`/`.agent-portal-info-card` fixes:

- `.agent-portal-mobile-card` (bg `#ffffff` → surface, border `#e5e7eb` → border)
- `.agent-portal-mobile-card-name` (color `#111827` → text)
- `.agent-portal-mobile-card-notes` (bg `#f8fafc` → background, border `#eef2f7` → border, color
  `#111827` → text)
- `.agent-portal-mobile-card-meta dd` (color `#111827` → text)
- `.agent-portal-mobile-card-actions` (border-top `#f1f5f9` → border)
- `.agent-portal-stage-card` (border `#e5e7eb` → border; `background: linear-gradient(180deg,
  #ffffff 0%, #f8fafc 100%)` → `var(--color-surface)`, flattening the subtle gradient rather than
  inventing a dark-mode gradient — the gradient is a light-mode-only refinement, not load-bearing)
- `.agent-portal-stage-title` (color `#111827` → text)
- `.agent-portal-submission-card` (bg `#fff` → surface, border `#e5e7eb` → border)
- `.agent-portal-submission-title` (color `#111827` → text)
- `.agent-portal-submission-footer` (border-top `#eef2f7` → border)
- `.agent-portal-process-card` (bg `#fff` → surface, border `#e5e7eb` → border)
- `.agent-portal-progress-marker` default state (bg `#ffffff` → surface, border `#cbd5e1` →
  border, color `#475569` → text-muted)
- `.agent-portal-progress-item.upcoming .agent-portal-progress-marker` (bg `#f8fafc` →
  background, color `#94a3b8` → text-muted)
- `.agent-portal-progress-title` (color `#111827` → text)
- `.agent-portal-history-card` (bg `#ffffff` → surface, border `#e5e7eb` → border)
- `.agent-portal-history-title` (color `#111827` → text)

### Pattern 2 — muted caption/label text only (no background)

`var(--color-text-muted)`:

- `.agent-portal-mobile-card-meta dt` (`#64748b`)
- `.agent-portal-stage-step` (`#94a3b8`)
- `.agent-portal-stage-copy` (`#334155`)
- `.agent-portal-submission-meta-item` (`#334155`)
- `.agent-portal-submission-meta-label` (`#94a3b8`)
- `.agent-status-pill-label` (`#64748b`) — the small caption above/beside a status pill in
  `SubmissionStatusBadge.tsx`'s consumers, not the pill itself

### Pattern 3 — tinted callout boxes

Translucent rgba tints derived from the actual dark-theme tokens, same method as the
`.agent-portal-banner` fix in Pass 2a:

- `.agent-portal-status-note` — light-mode is an amber-tinted note (`border: #fde68a`,
  `background: linear-gradient(#fffdf0, #ffffff)`, `color: #713f12`). Dark override:
  ```css
  [data-bs-theme="dark"] .agent-portal-status-note {
    border-color: rgba(245, 158, 11, 0.35);
    background: rgba(245, 158, 11, 0.1);
    color: #fcd34d;
  }
  ```
  (amber `rgb(245, 158, 11)` matches `ThemeContext.tsx`'s dark-theme `warning` token)
- `.agent-portal-current-status-card` — light-mode is a pink/red-tinted hero card
  (`border: #f5d0d3`, `background: linear-gradient(#fff8f8, #ffffff)`). Dark override:
  ```css
  [data-bs-theme="dark"] .agent-portal-current-status-card {
    border-color: rgba(239, 68, 68, 0.3);
    background: rgba(239, 68, 68, 0.08);
  }
  ```
  (its own text — `.agent-portal-current-status-title`, `#111827` — covered by Pattern 1's
  general text-color list above)
- `.agent-portal-notes-panel` — light-mode is `border-left: 4px solid #c1121f` +
  `background: linear-gradient(#fff7ed, #ffffff)`. Dark override:
  ```css
  [data-bs-theme="dark"] .agent-portal-notes-panel {
    background: rgba(193, 18, 31, 0.08);
  }
  ```
  (border-left color `#c1121f` is a saturated brand-adjacent red, left as-is in both themes —
  it's a 4px accent stripe, not body text, and reads fine on both light and translucent-dark
  backgrounds)

### Pattern 4 — near-brand-red link color

In-place edit (not theme-conditional — same value in both themes, this is just correcting a
near-miss to the real token). `#b32627`/`#8f1b1c` is a base/hover link-color pair that repeats
identically at several other locations in this file, outside this sub-pass's scope (e.g.
`.page-lists-cafc .btn-link`) — leave those alone; only the two occurrences below, since they're
the only two actually consumed by this sub-pass's files:
- `.agent-dashboard-table .btn-link` — base `color: #b32627` → `var(--color-primary)`. Hover
  (`color: #8f1b1c`) stays as the literal hex, unchanged — it's already a sensible darker-red
  hover shade that reads fine in both themes, and changing only the base color keeps this pair
  consistent with every other untouched `#b32627`/`#8f1b1c` occurrence in the file (touching the
  hover value here would make this one pair inconsistent with its siblings for no benefit).
- `.agent-portal-mobile-card-actions .btn-link` — identical treatment.

### Inline hex in `.tsx` files

Direct `'#111827'` → `'var(--color-text)'` swaps:
- `AgentDashboardPage.tsx:164` and `:171`
- `AgentSubmissionDetailPage.tsx` — all 9 occurrences (confirm exact line numbers at
  implementation time via `grep -n "#111827"`, since this spec was written from an earlier
  read and lines may have shifted)

## Explicitly left alone (self-contained, no fix needed)

- `SubmissionStatusBadge.tsx`'s actual badge classes (`.agent-status-badge` and its
  `-submitted`/`-under-review`/`-watching`/`-shortlisted`/etc. variants, `.agent-availability-*`)
  — each carries its own pastel-or-solid background paired with matching dark/light text, self-
  contained regardless of page theme.
- `.agent-portal-progress-item.complete`/`.current` marker states — same self-contained pill
  reasoning (solid green/red backgrounds with white or dark text already chosen for contrast).
- `.agent-portal-step-chip` — solid dark background (`#111827`) + white text, already reads
  correctly in any theme (same as `.agent-status-submitted`).

## Verification

- `tsc --noEmit`, CSS brace-balance check, frozen-file diff (standing practice).
- Live check in both themes: the Agent Dashboard table + its mobile-card view (resize or use
  dev-tools device emulation to trigger the mobile card layout, since it's likely a responsive
  breakpoint swap from the table), and a Submission Detail page (status journey / stage cards,
  current-status hero card, notes panel, history card) — confirm no light-card-on-dark-page
  patches remain anywhere, light mode confirmed byte-identical to before.
