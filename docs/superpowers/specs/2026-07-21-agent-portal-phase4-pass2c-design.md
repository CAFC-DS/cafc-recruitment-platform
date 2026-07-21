# Phase 4 Pass 2c: RecommendationForm.tsx dark-mode fixes

## Context

Final sub-pass of Phase 4 Pass 2 (after 2a — `.agent-portal-banner` — and 2b —
`AgentDashboardPage`/`AgentSubmissionDetailPage`/`SubmissionStatusBadge`, both done).
`RecommendationForm.tsx` (715 lines, no unit tests exist for it or anywhere in this codebase) is
the biggest and most bespoke file in the Agent Portal — a custom player-search autocomplete, a
custom multi-select dropdown, a wage-basis toggle, and a "manual entry" checkbox toggle, none of
which reuse Bootstrap form controls.

Full audit found:
- Zero inline hardcoded hex colors in the `.tsx` file itself — entirely CSS-class driven.
- All base form primitives it uses (`.agent-portal-input`, `.agent-portal-textarea`,
  `.agent-portal-label`, `.agent-portal-card`, `.agent-portal-surface-muted`,
  `.agent-portal-section-title`/`-copy`, `.agent-portal-banner`) are already dark-mode-fixed from
  Phase 4 Pass 1 and 2a.
- ~30 CSS rule groups for the bespoke UI (select dropdown, player-search dropdown, selected-
  player confirmation card, wage-basis toggle, manual-entry toggle) have no dark-mode treatment.

## Scope

**Files:**
- Modify: `frontend/src/styles/professional-theme.css` only. No `.tsx` changes.

**Frozen, not touched:** `colorUtils.ts`, `playerLists.theme.ts`, the `getAttributeGroupColor`
blocks, Kanban card-state border colors, `ScoutingAssessmentModal.tsx`.

## Design

### Pattern 1 — dropdown/menu/toggle surfaces (white bg + dark text → card treatment)

Additive `[data-bs-theme="dark"]` overrides, `var(--color-surface)` background /
`var(--color-border)` border / `var(--color-text)` text, same as every prior sub-pass:

- `.agent-select-trigger` (bg `#ffffff` → surface, border `#d7dee8` → border, color `#0f172a` →
  text)
- `.agent-select-chevron` (color `#64748b` → `var(--color-text-muted)`)
- `.agent-select-menu` (bg `#ffffff` → surface, border `#d7dee8` → border)
- `.agent-select-option` (bg `#ffffff` → surface, border-bottom `#eef2f7` → border, color
  `#111827` → text)
- `.agent-wage-basis-toggle` (bg `#f8fafc` → background, border `#d7dee8` → border)
- `.agent-wage-basis-option` (color `#475569` → `var(--color-text-muted)`)
- `.agent-wage-basis-option:hover`/`:focus` (color `#111827` → text, border `#cbd5e1` → border)
- `.agent-player-search-menu` (bg `#ffffff` → surface, border `#d7dee8` → border)
- `.agent-player-search-option` (bg `#ffffff` → surface, border-bottom `#eef2f7` → border, color
  `#111827` → text)
- `.agent-player-search-option-name` (color `#111827` → text)
- `.agent-player-search-option-meta` (color `#64748b` → text-muted)
- `.agent-player-search-divider` (color `#475569` → text-muted, bg `#f8fafc` → background,
  border-top/bottom `#eef2f7` → border)
- `.agent-player-search-divider strong` (color `#111827` → text)
- `.agent-player-search-suggestion` (bg `#fafbfc` → background — a near-white subtle tint in
  light mode, so `var(--color-background)` is the correct dark counterpart, distinguishing it
  from the plain-white `.agent-player-search-option` rows around it)
- `.agent-player-selected-name` (color `#111827` → text)
- `.agent-manual-toggle` (bg `#ffffff` → surface, border `#d7dee8` → border, color `#111827` →
  text)

### Pattern 2 — hover/active tint on select & search options (pink → translucent dark-red tint)

Light mode uses `background: #fff1f2; color: #9f1239;` for both
`.agent-select-option:hover`/`.active` and `.agent-player-search-option:hover`/`.active`. Dark
override, same rgba-from-actual-token method as every prior tint fix:

```css
[data-bs-theme="dark"] .agent-select-option:hover,
[data-bs-theme="dark"] .agent-select-option.active,
[data-bs-theme="dark"] .agent-player-search-option:hover,
[data-bs-theme="dark"] .agent-player-search-option.active {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}
```

`.agent-player-search-suggestion:hover`/`.active` only sets `background: #fff1f2` (no color
override — it inherits `.agent-player-search-option`'s text color). Its dark override only needs
the background tint; text color is already handled by Pattern 1's `.agent-player-search-option`
fix:

```css
[data-bs-theme="dark"] .agent-player-search-suggestion:hover,
[data-bs-theme="dark"] .agent-player-search-suggestion.active {
  background: rgba(239, 68, 68, 0.15);
}
```

### Pattern 3 — the "player selected" confirmation card (green tint)

Light mode: `background: #ecfdf5; border: 1px solid #a7f3d0; border-left: 4px solid #10b981;`.
Dark override, translucent green tint (same method as the Pass 2b `.agent-portal-current-status-card`
fix); the solid `border-left` accent stripe is left unchanged in both themes, same reasoning as
`.agent-portal-notes-panel`'s left-border accent in Pass 2b — it's a decorative stripe, not body
content, and reads fine on the new translucent background:

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

(`#6ee7b7` is the same light-green text tint already used for the Pass 2a success banner —
reused, not a new color choice.) `.agent-player-selected-change:hover`'s existing
`background: rgba(16, 185, 129, 0.12)` is already a translucent tint and needs no dark-mode
change — it's the same value in both themes already.

### Pattern 4 — neutral badge (light gray → dark card treatment)

`.agent-player-score-badge` (bg `#e2e8f0`, color `#1e293b`) is the same "neutral score pill on a
list row" shape as `.external-recommendations-score-badge`, fixed earlier this session with the
identical treatment:

```css
[data-bs-theme="dark"] .agent-player-score-badge {
  background: var(--color-border);
  color: var(--color-text);
}
```

### Pattern 5 — two near-brand-red accents (in-place, NOT theme-conditional)

Both are the same "used consistently everywhere as a link/accent red" family already handled
this way in Pass 2a/2b — same value in both themes, just corrected to the real token:

- `.agent-select-trigger.open`, `.agent-select-trigger:focus` — `border-color: #cc0000` →
  `var(--color-primary)`. Leave the accompanying `box-shadow: 0 0 0 4px rgba(204, 0, 0, 0.1)`
  completely unchanged — confirmed this exact `rgba(204, 0, 0, ...)` focus-ring shadow pattern
  repeats identically at 6 other locations in this file (none touched by any prior sub-pass), so
  leaving it as a literal rgba is the file's established, consistent convention, not an
  oversight.
- `.agent-manual-toggle input[type='checkbox']` — `accent-color: #b32627` → `var(--color-primary)`

## Explicitly left alone (self-contained, no fix needed)

- `.agent-player-selected-icon` — solid green circle (`#10b981`) + white checkmark, reads
  correctly in any theme.
- `.agent-wage-basis-option.active` — solid dark pill (`#111827` bg + white text), same
  self-contained reasoning already applied to `.agent-status-submitted` and
  `.agent-portal-step-chip` in earlier sub-passes.

## Verification

- `tsc --noEmit` (CSS-only change, but confirms nothing else broke), CSS brace-balance check,
  frozen-file diff.
- Live check in both themes: the player-search autocomplete (type a partial name, check the
  dropdown and hover states), the custom multi-select (Recommended Position, Agreement Type,
  etc.), the wage-basis toggle, the "Other (Manual Entry)" checkbox toggle, and — if a player can
  actually be selected in the test environment — the green "selected player" confirmation card.
  If test data/environment constraints prevent exercising every interactive state live (as
  happened with Pass 2b's submission-detail views), fall back to the same honesty standard: rely
  on task review's diff-level verification and say so plainly, rather than claiming a live check
  that didn't happen.
