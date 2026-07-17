# Design System Refresh — Spec

Status: **in progress** (Phase 0 + part of Phase 2 done). This is the durable, repo-versioned
spec for the platform-wide visual refresh, promoted from the working plan used to build
Phase 0. It supersedes that plan as the source of truth going forward; see git log on
`feature/design-system-refresh` for the detailed history of how each Phase 0 decision was
reached if it needs to be re-derived.

## Context

The platform's front end has one genuine brand anchor — Charlton red (`#b91c1c`) on a black
header — but it sits on top of a generic, incrementally-patched Bootstrap skin: no loaded
webfonts (system-font fallback everywhere), no icon library (raw emoji used as icons
throughout), 50+ near-duplicate hex values scattered across a 4,522-line CSS file, a dozen
inconsistent border-radius values, and heavy hardcoded inline styling concentrated in a few
pages (`PlayerProfilePage.tsx` alone had 132 hardcoded hex colors and 72 inline `style={{}}`
blocks before Phase 2 work started on it). `App.css` carried a contradictory leftover
pure-black/red "emergency dark mode" stylesheet that actively conflicted with the current
theme (deleted in Phase 1).

Decisions already confirmed with the user:
- **Branch**: `feature/design-system-refresh`, off `main`, as a git worktree at
  `../NewRecruitmentPlatform-design-refresh` to stay isolated from other in-progress work on
  the main checkout (`feature/flow-history-recommendation-note`).
- **Brand color**: keep Charlton red as the anchor; refine the supporting palette/typography/
  icons around it rather than replacing the core identity.
- **Rollout**: foundation first (tokens, type scale, icon system, shared primitives), then a
  phased page-by-page migration, continuing across the whole platform.
- **Theme parity**: design light and dark in lockstep — every token gets both values from the
  start, matching how `ThemeContext.tsx` is already architected.

## Out of scope: data/status colors (do not change) — hard constraint

The user was explicit and repeated this constraint unprompted multiple times: grade colors,
radar colors, assessment template colors, Kanban colors, and stage colors must not change —
these are meaningful/semantic to scouts, not decoration. Precisely scoped:

- **Grade colors (1–10 / 0–100 scales)** — all defined in `frontend/src/utils/colorUtils.ts`:
  `getPerformanceScoreColor`, `getAttributeScoreColor`, `getAverageAttributeScoreColor`,
  `getFlagColor`, `getRecommendationColor`, `getGradeColor`, `getContrastTextColor`. Leave
  every hex value in this file untouched (includes the gold `#EFBF04`/silver `#c4c4c4`
  special cases).
- **"Radar" colors** (the app's attribute chart is actually a Chart.js `PolarArea`, not a
  literal radar chart, but it's what the user means) — defined redundantly in three places:
  `getAttributeGroupColor`/`getPositionAttributeGroupColor` in `PlayerReportModal.tsx`
  (~lines 303-309), `PlayerProfilePage.tsx` (~lines 435-468, 942-952), and
  `SharedReportPage.tsx` (~lines 226-231) — the `#009FB7`/`#9370DB`/`#7FC8F8` group triad plus
  the grey "not scored" fill. Leave exactly as-is in all three files.
- **Assessment template colors** — `ScoutingAssessmentModal.tsx` has no grade-driven color
  logic (just generic chrome: `#000000` modal header, Bootstrap-blue `#0d6efd` range-slider
  thumb, a couple of static info boxes). Leave all of it untouched, including the modal
  header — it will keep pure black even after the rest of the app's "ink" shifts to graphite;
  known, intentional seam, not an oversight.
- **Kanban colors** — score badges (covered by `colorUtils.ts` above), plus card-state
  borders in `Kanban/PlayerKanbanCard.tsx` and `Kanban/CollapsiblePlayerBar.tsx`
  (pending-removal red `#ef4444`, unsaved-changes amber `#f59e0b`, archived dashed grey,
  favorite-star gold `#FFD700`, decision-marker black `#111827`). Leave as-is.
- **Stage colors** — single source of truth `frontend/src/styles/playerLists.theme.ts`: the
  `stageColors` object (lines 10-41) and its accessors (`getStageBgColor`, `getStageTextColor`,
  `getStageLightColor`, `getStageBorderColor`). Leave every value untouched.
- **`ThemeContext.tsx`'s `success`/`warning`/`danger` fields** are live, not dead — written to
  Bootstrap's `--bs-success`/`--bs-warning`/`--bs-danger` CSS variables at runtime, and
  `variant="success"`/`bg="danger"` etc. appear 60+ times across the app on grade/stage/
  recommendation-adjacent surfaces. Treat as frozen alongside everything above. The new
  `pitch`/`amber` tokens are separate, additive fields — never repurposing these three.
- **Judgment call, confirm before touching**: `playerLists.theme.ts` also defines
  `listBadgeColors` — an arbitrary cyclic palette for user-created list badges, not
  stage-semantic. Reads as fair game, but flag it for a quick confirm first since it lives
  next to the frozen `stageColors`.

Everything else — backgrounds, surfaces, neutrals, borders, typography, icons, buttons,
navbar, card chrome, shadows, radii — is in scope.

## Design direction (validated in Phase 0, now final)

Grounded in what this product actually is: a data-dense, internal scouting/recruitment tool
used daily by staff to scan reports, grades, and tables — not a marketing site. Restraint and
legibility matter more than decorative flourish. Avoid generic "AI SaaS" tropes: no cream/
parchment background, no glassmorphism/blur/gradient surfaces, no pill-shaped buttons
everywhere, no decorative numbered markers, no icon-free emoji-as-UI.

**Color tokens** (light values shown; each has a dark-mode counterpart in `ThemeContext.tsx`):
- `primary` — `#B91C1C` (unchanged, exact brand recognition)
- `ink` — `#181A1F` graphite (replaces pure `#000000` header/dark surfaces)
- `surface` — `#F6F7F8` cool off-white
- `pitch` (generic UI positive — toasts, form validation, non-grade status badges only) —
  `#1E7A44`, a new field, never repurposing the frozen `success` token
- `amber` (generic UI warning/neutral only) — `#B45309`, deliberately distinct from the
  frozen stage/kanban amber
- `ink-muted` — `#5B6169` cool slate for secondary text

None of the above touch the frozen grade/radar/assessment/Kanban/stage colors, including any
that happen to share a similar shade.

**Typography** (self-hosted `.woff2` via `@fontsource`, no CDN dependency):
- Display (headings, used sparingly): **IBM Plex Sans Condensed**, bold
- Body/UI (everything else): **IBM Plex Sans**
- Data/utility (grades, stats tables, timestamps, IDs): **IBM Plex Mono**, tabular figures

**Structure**: radius scale `sm 6px / md 10px / lg 16px`. Shadows collapse to 2–3 elevation
tokens (resting/raised/modal), no blur/backdrop-filter.

**Icons**: `lucide-react` for everything, retiring emoji-as-icon usage. One exception:
`@tabler/icons-react`'s `IconBuildingStadium`, added solely because lucide has no stadium
glyph and the Live-scouting icon must read unambiguously as a stadium.

**The Grade Chip**: the 1–10 performance score is the actual core concept of scouting, so a
single, consistent `GradeChip` component (used everywhere a score renders) is the redesign's
signature element. It's a **consolidation, not a recolor** — wraps the existing, unmodified
`getPerformanceScoreColor`/`getContrastTextColor` output in one shape/size/typography
treatment. **Shape: square-ish, `border-radius: 6px`** (changed from an initial full-pill
`999px` design after direct user feedback on the live page — pills are visually confusable
with status pills and the user simply prefers the squarer look). No grade hex value changes,
ever.

**`GradeLabelChip`**: a second, distinct component for a separate legacy concept — archived
reports' categorical grade label (`report.flag_category`, e.g. `"Outstanding/Above Level"`,
colored via `getGradeColor`, a different function from the numeric performance-score color).
Same visual family as `GradeChip` (pill shape retained here — only `GradeChip`'s shape
changed, per explicit scoping in the user's feedback). Multi-part labels split on `/` and
wrap to two lines via `<br/>`, **keeping the `/` character visible** between parts (a
regression was introduced and fixed once already — watch for this if this component is ever
touched again).

**No `FlagChip`.** An earlier iteration built a `FlagChip` (colored flag icon, same pill
family) to render in the Score column for Flag-type reports. Direct user feedback rejected
this: having a flag icon in both the Type column (report-type indicator) and the Score column
was redundant. Decision: **the flag only ever appears in the Type column** (unchanged,
existing behavior); the Score column renders nothing for Flag/Flag Assessment reports (they
carry no `overall_rating` in the data model anyway). `FlagChip.tsx` was deleted once it had
zero remaining references. **Do not reintroduce a Score-column flag treatment** without
raising it with the user first — this was an explicit, deliberate rejection, not an oversight.

**Data model facts this whole effort depends on** (get these wrong and every chip is wrong):
- A report carries either a performance score or a potential score, never both. Potential is
  a boolean (`is_potential`) rendered as a trailing, superscript `*` — never `/10`.
  Per-report scores are whole numbers; player-level averages (e.g. Kanban cards) are decimals
  rendered to 1 place, matching `avg_performance_score.toFixed(1)`.
  `GradeChip`'s `decimals` prop controls which (`0` default, `1` for averages).
  `PERFORMANCE_SCORE`/`overall_rating` exists only on Player Assessment reports — Flag reports
  have none.
- Dates render `dd/mm/yyyy` via `toLocaleDateString("en-GB")` — the app-wide convention.
- The Type column shows icons, not text: `getReportTypeBadge` + `getScoutingTypeBadge`.

## Phases

**Phase 0 — Style tile / proof-of-concept — DONE, APPROVED.**
Built `LoginPage.tsx`/`.css`, `ThemeContext.tsx` additive tokens, `fonts.css`, `GradeChip`,
`FlagChip` (since deleted, see above), a standalone `/design/style-tile` dev-only review route
not linked from production nav. Went through several real correction rounds (layout
direction, font choice, table content fidelity, icon choices) before sign-off.

**Phase 1 — Foundation — DONE.**
Color tokens, self-hosted fonts, `GradeChip`, emoji→icon in `DarkModeToggle.tsx` and
`Navbar.tsx`, deleted dead `App.css`. Decision: `professional-theme.css`'s remaining ad hoc
radius/shadow/font-size values do **not** get a standalone global sweep — that file's `:root`
also holds the frozen Bootstrap variant colors, so a blind sweep risks nicking one for no
user-visible payoff. Cleanup folds into each page's own migration instead; leftovers swept in
Phase 5.

**Phase 2 — Highest-value pages — Track 1 DONE for all 5; Track 2 underway.**
`PlayerProfilePage.tsx` (132 hardcoded colors), `HomePage.tsx`, `PlayerListsPage.tsx`,
`ScoutingPage.tsx`, rest of `Navbar.tsx`.
- `PlayerProfilePage.tsx`: chip rollout done (6 score sites → `GradeChip`/`GradeLabelChip`,
  `FlagChip` removed per the correction above), emoji→icon done, Type-column centering done.
- `HomePage.tsx`: chip rollout done (`performance_score` → `GradeChip`, archived
  `flag_category` → `GradeLabelChip`), 12 emoji→icon. `attribute_score` badges and the flag
  sentiment text badge deliberately left as-is (different metric / no Type-column redundancy
  to resolve on this page — see commit message for full reasoning).
- `PlayerListsPage.tsx`: avg-score badge → `GradeChip`, ~20 emoji→icon across list actions,
  report-type badges, row actions. Frozen favorite-star (`#FFD700`) and decision-marker
  (`#111827`) hex preserved byte-for-byte — only the glyph swapped to a matching-color icon.
  `EmptyState.tsx`'s `icon` prop widened to `React.ReactNode` as a direct dependency.
- `ScoutingPage.tsx`: chip rollout + emoji→icon done, Score column simplified to `GradeChip`
  only (no Flag branch), Type column centered, `getFlagTypeText` dead code removed.
- `Navbar.tsx`: emoji→icon done (Phase 1). Hardcoded-hex audit complete — no Track-1-safe
  substitutions found; the two remaining hex blocks are theme-independent overlays,
  documented as Track 2 items below.
- **Track 2, round 1 (user's first logged-in dark-mode pass) — DONE, fixed:** `.btn-action-circle`
  family was hardcoded `#000000` border/text on transparent bg, invisible in dark mode — now
  `var(--color-text)`/`var(--color-surface)`, fixes the primitive across all 8 consuming files.
  Player-name link colors on `ScoutingPage.tsx`/`PlayerListsPage.tsx` (`#0d6efd`/`#212529`/
  `colors.primary`) were fixed hex, not theme-reactive — now swap per `theme.isDark` (kept the
  existing light-mode hex exactly; picked Bootstrap's/Tailwind's own established dark-mode
  companion shades rather than inventing new ones). `.age-text`/`.position-text` referenced a
  never-defined `--color-text-secondary` var (dead reference, always fell back to hardcoded
  `#6b7280`) — fixed to the real `--color-text-muted`. `PlayerListsPage.tsx`'s live/intel badges
  and `ArchiveInfoContent` popover text were also fixed-hex, now theme-reactive. Decision-marker
  frozen `#111827` got a dark-mode-only exception (`#E5E7EB`) — explicit user sign-off, light
  mode unchanged. Intel icon changed `Radar`→`FileSearch` on both the Navbar Intel link and the
  Lists badge (user chose both, to avoid a split icon vocabulary). `HomePage.tsx`: removed the
  "View All" button from all three widgets, swapped Recent Scout Reports' icon to tabler's
  `IconBallFootball`. Full reasoning in the two commits following "Close Navbar.tsx hex audit."
  Not yet reviewed by the user: whether these fixes read correctly in their browser.
- **Not yet done for any of the 5**: full-page chrome/token recolor (backgrounds, borders,
  remaining hardcoded neutrals, inline-`style` consolidation) — this is Track 2 and needs the
  user's own eyeball pass in their logged-in browser, per the acceptance criteria below.

**Phase 3 — Remaining internal app.**
`KanbanPage.tsx`, `PlayerReportModal.tsx`, `ScoutingAssessmentModal.tsx` (chrome only, colors
stay frozen), `IntelPage.tsx`/`IntelModal.tsx`, `AnalyticsPage.tsx`, `AdminPage.tsx`,
`ExternalRecommendationsListPage.tsx`, `internal/InternalRecommendationsPage.tsx`,
`SharedReportPage.tsx`.
- `PlayerReportModal.tsx`, `PlayerProfilePage.tsx` (Flow History), and `IntelPage.tsx` each got
  a **scoped dark-mode-legibility-only** pass out of order (Track 2 round 2, driven by user
  screenshots of the live app), not their full Phase 3 migration — chip rollout, emoji→icon,
  and chrome/token recolor are still outstanding on all three. Don't treat them as "done" for
  Phase 3 just because dark mode now reads correctly on them.

**Phase 3.5 — Interaction states: hover, loading, shimmer.**
Explicitly called out by the user as its own workstream, not yet started: "incorrect loading
states, not proper loading states, shimmer animations all need work." Scope not yet fully
audited. One data point already checked: `ShimmerLoading.tsx` / `.shimmer-line` /
`.shimmer-card` (`professional-theme.css` ~L2226-2298) already have a real
`[data-bs-theme="dark"]` variant (different gradient stops, dark card bg/border, even a
`prefers-reduced-motion` fallback for both themes) — so shimmer is not universally broken,
whatever's wrong is likely narrower (a specific loading spot, a specific page) or about
correctness/timing (a shimmer that doesn't match its real content's layout, or a spinner used
where a shimmer would read better) rather than color. Still to audit: spinner usage
consistency across pages, loading-state correctness (right skeleton shape for the content it
precedes), and hover states on chrome beyond the two dead-`--bs-gray` cases already fixed in
round 2 (that fix was incidental, found while sweeping dead color-variable references, not
from a dedicated hover audit — there may be more). Needs its own survey pass before estimating
further; don't assume the two data points above generalize.

**Phase 4 — Agent Portal reconciliation.**
`pages/agents/*` / `components/agents/*` currently has its own distinct look (slate
`#0f172a`, unloaded 'Inter' intent, `#cc0000`). Bring onto the same token system as a
harmonized "external" variant, not a third unreconciled look. Adopt the stale branch's idea
of one shared auth-page layout between internal login and agent login, properly this time.

**Phase 5 — Cleanup & verification.**
Remove now-dead tokens/CSS as pages migrate off old classes. Full verification pass (below).

## Acceptance criteria

This is a subjective visual redesign for a hands-on stakeholder who has, in practice,
substantively corrected nearly every deliverable so far (design direction, data model
fidelity, dates, flag placement, chip shape, a punctuation regression). There is no
self-certifiable oracle for "looks right." Splitting the criteria below into what an agent
can verify alone versus what genuinely needs the user's eyes is the difference between a
spec that can actually be finished and one that loops forever on an unstatable goal.

### Track 1 — objective, self-verified before every commit (no exceptions)

- `git diff --stat main -- <every frozen file listed above>` is empty. This is the hard
  constraint; run it every commit, not just at phase boundaries.
- `npm run typecheck` (`tsc --noEmit`) is clean.
- `npm run lint` introduces no *new* warnings/errors vs. the same command on `main` (compare
  counts explicitly — pre-existing warnings are not this effort's to fix incidentally).
- Zero emoji characters remain in any file touched for icon migration (scripted regex scan).
- Every score/grade render goes through `GradeChip` or `GradeLabelChip` — no new one-off
  inline score badge implementations.
- No new hardcoded hex color introduced outside the frozen files above — chrome colors come
  from tokens.
- `npm test` passes (where tests exist for a touched area).
- PDF export (`html2canvas` + `jsPDF`) still renders a real report correctly once self-hosted
  fonts and new colors are live — custom `@font-face` and any lingering effects are a common
  `html2canvas` failure point; check explicitly, don't assume.

Migrations that are purely mechanical and pass all of Track 1 (emoji→icon swaps, chip
rollouts, hex→token substitutions with no layout change, dead-CSS removal) can proceed
continuously, page after page, without stopping for sign-off on each one — the checks above
are the gate.

**Caveat on "hex→token substitution":** this is only Track 1 when the element's foreground
*and* background both come from the same theme-reactive source today. A hex→token swap is
**not** mechanical — it's a Track 2 design decision — whenever a color is deliberately
theme-*independent*: an overlay panel with a fixed light (or dark) background regardless of
app theme, paired with fixed text/border colors chosen for contrast against that fixed
background. Tokenizing only one side of such a pair (e.g. swapping the text color to
`var(--color-text)` while the background stays a hardcoded near-white) silently breaks
contrast in one theme — with zero layout change and zero type/lint error, so none of the
other Track 1 gates catch it. Confirm foreground and background genuinely move together in
*both* themes before tokenizing; if that's not already true today, leave the block hardcoded
and flag it as Track 2 (see Navbar.tsx findings below).

### Track 2 — human-gated, explicitly not self-certified

- Any change to chrome layout, spacing, backgrounds, borders, or "how a whole page looks" is
  a **checkpoint**, not a criterion to tick off internally. Present it (screenshot when the
  page renders without auth, e.g. via the style-tile route or an unauthenticated page; a
  description of the diff plus a request for the user to look at the real page otherwise) and
  wait for explicit sign-off before treating that page as done.
- Known, permanent verification limit for this session: the agent's browser tab is an
  isolated context with no login, and the agent will not enter a password into the login form
  under any circumstances. This means authenticated pages cannot be screenshotted by the
  agent — ever, not just until some backend issue resolves. Shared/reusable primitives (chips,
  badges, icon patterns) stay verifiable by mounting them on the unauthenticated
  `/design/style-tile` route, as already practiced. Whole authenticated pages get the
  agent's Track 1 checks plus a code-level self-review, and then the user's own eyeball pass
  in their logged-in browser — the doc should not claim more verification happened than
  actually did.
- `Navbar.tsx` hardcoded-hex audit (Phase 2) found two theme-independent overlay blocks that
  were deliberately left hardcoded rather than tokenized, per the caveat above — both are
  Track 2 (a real design choice: should this become theme-adaptive?), not Track 1 leftovers:
  - The search-results dropdown (~lines 485-664): a light panel (`rgba(255,255,255,0.95)` /
    `#ffffff` background, `#374151`/`#6b7280`/`#666`/`#000000`/`#f3f4f6`/`#eee`/`#f0f9ff`
    text/border) that overlays the dark navbar in both app themes by design. Foreground and
    background are a coordinated fixed-light pair; tokenizing only the text broke dark-mode
    contrast (caught and reverted before commit).
  - The Queue Review Modal (~lines 851, 862): `Modal.Header` (`#007bff` bg, white text) and a
    `Card` (`#f0f8ff` bg, `#007bff` border) — literal Bootstrap-blue chrome, not brand tokens,
    coordinated the same way. Whether this should move onto the app's red/graphite palette
    (and/or theme-swap) is a Track 2 call, not a mechanical substitution.

### Operating mode

Two tracks running concurrently: Track 1 work (mechanical, low taste-risk) proceeds
page-by-page without pausing between pages. Track 2 checkpoints (anything visual/chrome)
pause for sign-off per page or small cluster of pages, matching the pattern already
established for `PlayerProfilePage.tsx`. A page is only marked done in this doc once both
tracks pass for it.

`/goal` is a user-run UI command for tracking this work — it cannot be invoked by the agent.
Using it or not doesn't gate this spec or the migration; they proceed either way.

## Files most affected (representative, not exhaustive)
- `frontend/src/contexts/ThemeContext.tsx` — token source of truth
- `frontend/src/styles/professional-theme.css` — bulk of global styling
- `frontend/src/utils/colorUtils.ts` — **read-only reference**, never edit its color values
- `frontend/src/components/GradeChip.tsx`/`.css`, `GradeLabelChip.tsx`/`.css` — shared score
  primitives
- `frontend/src/styles/fonts.css`, `frontend/src/pages/StyleTilePage.tsx`/`.css` (dev-only
  review route)
- Page migration pattern repeats across `PlayerProfilePage.tsx`, `PlayerListsPage.tsx`,
  `HomePage.tsx`, `SharedReportPage.tsx`, `PlayerReportModal.tsx`, `ScoutingPage.tsx`, and the
  rest of `frontend/src/pages/`

**Do not modify color values in**: `frontend/src/styles/playerLists.theme.ts`, the
`getAttributeGroupColor`/`getPositionAttributeGroupColor` blocks in `PlayerReportModal.tsx`/
`PlayerProfilePage.tsx`/`SharedReportPage.tsx`, `Kanban/PlayerKanbanCard.tsx`/
`Kanban/CollapsiblePlayerBar.tsx`, and `ScoutingAssessmentModal.tsx` (left entirely as-is).

## Known open items outside this spec's scope
- A CORS fix (`backend/main.py`, dev-mode allowlist gained `localhost:3055`) and a backend
  restart were made in the **main checkout**, on the user's `feature/flow-history-
  recommendation-note` branch, to unblock local testing of this work. That change is
  currently uncommitted, sitting alongside the user's own unrelated in-progress work on that
  branch. Awaiting the user's call on whether to commit it or leave it as a local-only tweak.
