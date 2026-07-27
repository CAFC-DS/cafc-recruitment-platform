# Agent Intel Card Redesign — Design Spec

Branch: `feature/agent-intel-card-redesign`

## Problem

On the player profile page, the "Intel History" agent recommendation card
(`.agent-rec-card` in `PlayerProfilePage.tsx`) and its detail modal
(`AgentRecommendationModal.tsx`) don't participate in the site's theme system:

- `.agent-rec-card` and its children (`professional-theme.css` ~line 3378) are
  hardcoded to `background: #ffffff` with hardcoded dark text colors
  (`#111827`, `#64748b`, `#1e293b`, `#eef2f7`, etc.) instead of the
  `--color-*` custom properties the rest of the app uses. In dark mode this
  leaves a stark white card sitting in a dark page.
- `AgentRecommendationModal.tsx` uses Bootstrap's `bg-light text-dark` on
  several `Card.Header`s. `ThemeContext.tsx` repoints `--bs-light` to the dark
  surface color and `--bs-dark` (consumed by `.text-dark`) to a near-black
  color when `isDark` is true, so `bg-light text-dark` becomes dark text on a
  dark background — unreadable. The "View Note History" button
  (`.agent-rec-fixed-light-btn`) was previously patched to a fixed grey
  (`#374151`) on the assumption its header stays light, but that assumption
  breaks in dark mode for the same reason, so the button becomes low-contrast
  too.

Separately, on the same page's "Scouting History" report cards:

- The 1–10 score (`GradeChip`) renders at `size="sm"`, which reads as small
  relative to the rest of the card.
- The video/live scouting-type badge (`getScoutingTypeBadge` in
  `PlayerProfilePage.tsx`) uses a `Laptop` icon (lucide-react, 14px) for
  "video" and `IconBuildingStadium` (@tabler/icons-react, 16px) for "live".
  Both are already theme-reactive (`currentColor`, transparent background) so
  they aren't visually broken in dark mode, but they're small and similar
  enough in weight that they don't read as distinct at a glance.

## Scope

1. `PlayerProfilePage.tsx` — `.agent-rec-card` markup/usage (Intel History
   cards view), `getScoutingTypeBadge`, and the `GradeChip` size on Scouting
   History report cards.
2. `AgentRecommendationModal.tsx` — card headers and the note-history button.
3. `professional-theme.css` — `.agent-rec-card*` rules, dark-mode overrides,
   `.agent-rec-fixed-light-btn`, `.badge-neutral-grey` usage for the scouting
   type badge.

Out of scope: the Intel report cards (non-agent, `IntelModal`/plain intel
cards render further down the same section) — those already use `--color-*`
vars and aren't part of this complaint. No backend changes.

## Design

### 1. Dark-mode theming for `.agent-rec-card`

Follow the existing additive-override pattern already used for
`.agent-portal-*` and `.external-recommendations-*` in
`professional-theme.css` (search `[data-bs-theme="dark"] .agent-portal-card`
for the precedent): leave every light-mode rule as-is, and add a
`[data-bs-theme="dark"] .agent-rec-card...` block that repoints backgrounds
to `var(--color-surface)`, borders to `var(--color-border)`, and text to
`var(--color-text)` / `var(--color-text-muted)` as appropriate for each child
class (`-name`, `-agency`, `-chip`, `-meta dt/dd`, `-view-btn`, `-strip`
border). No structural/layout changes to the card — same grid, same content,
same information hierarchy the user already knows.

### 2. `AgentRecommendationModal.tsx` headers

Replace the `bg-light text-dark` inline/className combo on each `Card.Header`
with the same theme-var approach `IntelModal.tsx` already uses for its body
content (`Modal.Header` stays black/white — that's consistent site-wide and
untouched). Concretely: drop `bg-light text-dark`, style headers with
`backgroundColor: var(--color-surface)` / `color: var(--color-text)` (or an
equivalent CSS class if that reads cleaner than five inline styles) so they
track the theme instead of being locked light.

Once the header is theme-reactive, delete `.agent-rec-fixed-light-btn` and
its dark-mode-blind styling — restore `View Note History` to the ordinary
`outline-secondary` treatment other buttons in the app use, which will now
correctly track the header's real background in both themes.

### 3. Score size (Scouting History cards)

Change `GradeChip` usage in the report-card score cell (`PlayerProfilePage.tsx`,
the "Right: Score" column of the Scouting History cards view) from
`size="sm"` to `size="lg"`. No changes to `GradeChip`/`GradeChip.css` — the
`lg` variant and the `--font-mono` tabular-numeral styling already exist and
are already theme-safe.

### 4. Scouting-type icons

In `getScoutingTypeBadge`:
- Swap the `Laptop` icon for lucide-react's `Video` icon (more literal match
  for "video scouting" than a laptop) at the Live icon's size class, keep
  `IconBuildingStadium` for "live" (already a strong semantic match — it's
  literally a stadium).
- Increase both icon sizes from 14/16px to ~18-20px.
- Give each badge a subtle tinted circular background (reusing the visual
  weight of `.btn-action-circle`'s treatment, not its exact styling) so Video
  and Live read as distinct badges rather than two similar grey outline
  glyphs. Colors pull from the existing `--color-*` palette (no new brand
  colors), one tint for video and a different tint for live, both legible in
  light and dark mode.

### Font

No change needed. The site's existing type system
(`styles/fonts.css`) already assigns `--font-mono` (IBM Plex Mono, tabular
numerals) to scores/tabular data — `GradeChip` already uses it. Nothing here
introduces a new font choice.

## Testing

- Manually verify the Intel History agent card and its modal in both light
  and dark mode (toggle via the app's dark mode control) — confirm all text,
  borders, and the "View Note History" button are legible in both.
- Manually verify the Scouting History cards' score size and the two
  scouting-type icons in both themes.
- No automated test suite currently covers this UI; rely on manual
  verification via the running dev app (`run` skill) before calling this
  done.
