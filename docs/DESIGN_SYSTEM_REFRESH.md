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
- **Track 2 round 3 (user's third dark-mode pass, driven by 3 more screenshots) — DONE:**
  `PlayerReportModal.tsx`'s `.btn-close` was inverted-to-white but inherited Bootstrap's default
  0.5 opacity, reading as too faint against the black modal header — bumped to 0.9/1.0 on hover.
  `.badge-neutral-grey` (used by the "Tags:" row on Scouting/Intel History cards, both here and
  reused on `AnalyticsPage.tsx`/`PersonalAnalyticsPage.tsx`/`ScoutingPage.tsx`/
  `StageMovementAnalyticsTab.tsx`) had `color: #374151 !important` hardcoded against a
  `background: transparent` badge — invisible on dark cards; now `var(--color-text, #374151)`.
  **Root-cause finding on `PlayerProfilePage.tsx`:** the page has two entirely separate styling
  systems — scattered inline `style={{}}` (the target of rounds 1-2's fixes) and a ~630-line
  embedded `<style>{\`...\`}</style>` block at the end of the file (was L3400-4030) defining
  every custom class used via `className` (`.profile-header`, `.attribute-section`,
  `.tabs-section`, `.report-card`, `.notes-section`, `.clean-table`, `.no-attributes-section`,
  etc.) — 100% hardcoded to light-mode hex with zero dark-mode selectors. This is why the page
  kept reading as "still the same" after two rounds of inline-only fixes. Fixed by tokenizing
  every rule in place (not adding a parallel dark block): flat surfaces (`white`, used for
  raised cards) → `var(--color-surface)`; sunken/recessed panels (`#fafafa`/`#f8f9fa`) →
  `var(--color-background)` — kept as two distinct tokens to preserve the page's existing
  raised/sunken depth hierarchy rather than flattening both to one grey; text `#222`/`#333` →
  `var(--color-text)`, `#555`/`#666`/`#888`/`#999` → `var(--color-text-muted)`; borders
  `#ddd`/`#e0e0e0`/`#f0f0f0`/`#e9ecef`/`#bbb` → `var(--color-border)`. Left untouched as
  intentional: `.badge.bg-gold`/`.badge.bg-silver` (black-on-gradient medal badges, readable in
  both themes by construction, same reasoning as the frozen gold/silver grade special-case),
  the `#22c55e` filled-dot score indicator (semantic, matches the frozen grade-color family),
  and both Delete Confirmation Modal headers' `#000000`/white (same always-black-header pattern
  as the report modal and `ScoutingAssessmentModal.tsx`). Also fixed one inline override that
  survived the class-level fix: the "Attribute Analysis" heading's `borderBottom` was
  re-hardcoded to `#e5e7eb` on top of the (now-tokenized) `.section-title` class.
  **Correction to a stale conclusion in this doc:** the Phase 2 Track 2 note below previously
  claimed `Navbar.tsx`'s search dropdown was "a coordinated fixed-light pair" left hardcoded on
  purpose, and that tokenizing broke contrast. That was a misdiagnosis — the real cause was
  `professional-theme.css`'s `.navbar-search-input`/`.navbar-search-dropdown`/
  `.search-result-item` rules (L1511-1636), a second, `!important`-flagged styling system for
  the same markup that silently overrode the JSX's already-tokenized inline styles (CSS
  `!important` beats a plain inline style regardless of specificity). Fixed by tokenizing that
  CSS block too (`var(--color-surface)`/`var(--color-border)`/`var(--color-text)`/
  `var(--color-text-muted)`/`var(--color-primary)`, `!important` kept), plus the search icon's
  inline `color: "#6b7280"` in `Navbar.tsx`. Foreground and background now move together
  because there's only one system left, not two disagreeing ones — no user re-verification yet.
- **Track 2 round 4 (user asked for the same pass across "all pages," granted browser access
  to an already-authenticated session — agent did not and will not enter credentials) — DONE:**
  Two bug classes found this round, both bigger than "dark mode":
  - **Missing `modal-header-dark` class = invisible close button in every theme, not just
    dark.** A literal-black `Modal.Header` only gets its close-button `filter: invert(...)`
    override when tagged `className="modal-header-dark"`; without it, Bootstrap's default
    black-X SVG renders on a black background — invisible in light mode too. Audited every
    `backgroundColor: "#000000"`/`"#000"` `Modal.Header` app-wide (grep, not sampling) and added
    the class to the ones missing it: `PlayerLists/PlayerNotesModal.tsx`,
    `PlayerLists/StageChangeReasonModal.tsx`, `PlayerLists/StageHistoryModal.tsx`,
    `IntelPage.tsx`, `ScoutingPage.tsx`, `PlayerProfilePage.tsx` (both Delete Confirmation
    modals), `PersonalAnalyticsPage.tsx`, `FeedbackModal.tsx`. `Card.Header`s with the same
    black background (no close button, no bug) were left alone. Also consolidated the
    close-button opacity fix (round 3's `0.9`/hover-`1.0`, previously only in
    `PlayerReportModal.tsx`) into one global `.modal-header-dark .btn-close` rule in
    `professional-theme.css`, so `AddPlayerModal.tsx`/`IntelReportModal.tsx`/
    `AgentRecommendationModal.tsx`/`AddFixtureModal.tsx` (which had no local override at all —
    the worst case, permanently invisible) get it too, without editing those 4 files directly.
    This global rule also improves `ScoutingAssessmentModal.tsx`'s close button as a side
    effect (same class, same selector) — that file itself was not edited, per its freeze.
  - **A second, separate CSS-leak bug, same shape as round 3's search-box `!important`
    override:** `FeedbackModal.tsx` (mounted globally via `Navbar.tsx`, so always present in
    the DOM) declared `.modal-header .btn-close { filter: invert(1)... }` — scoped to
    Bootstrap's generic `.modal-header` class, not `.modal-header-dark`. Since every modal in
    the app carries `.modal-header`, this one rule was inverting the close-button icon on
    *every* modal in the app to white, all the time — invisible-on-invisible for any modal with
    a normal light header. Rescoped to `.modal-header-dark` (matching the pattern everywhere
    else) and gave `FeedbackModal`'s own header the class it was relying on implicitly.
  - **Chrome tokenization**, same pattern as prior rounds: `AnalyticsPage.tsx` and
    `PersonalAnalyticsPage.tsx`'s embedded `<style>` blocks (tabs, tables, hover states — chart
    dataset colors in `PersonalAnalyticsPage.tsx`'s line-chart config left untouched, genuine
    data-viz, not chrome); `IntelModal.tsx`'s `.intel-type-card` border/hover; the duplicated
    autocomplete-dropdown chrome in `AddPlayerModal.tsx`/`AddFixtureModal.tsx` (fixed
    background, no dark-mode reactivity, 2 occurrences each); one player-name link color in
    `PersonalAnalyticsPage.tsx` and one "Add →" accent in `KanbanPage.tsx`, both swapped to the
    established `theme.isDark ? "#6ea8fe" : "#0d6efd"` pattern.
  - **Explicitly deferred, not overlooked:** `ScoutingAssessmentModal.tsx` (frozen, per the
    constraint at the top of this doc — not edited beyond the incidental global CSS effect
    above). `SharedReportPage.tsx` (30 hex hits, ~20 of them the frozen radar triad; the rest —
    Strengths/Areas-for-Improvement card colors, text — left alone because the page has zero
    `useTheme` wiring and no dark-mode toggle exposed; it reads as an intentionally
    fixed-appearance external-facing artifact, same spirit as "no crest watermark on PDF
    export," not a page that silently inherited the internal app's dark mode by omission —
    worth a direct confirm with the user before wiring it up either way).
    `ExternalRecommendationsListPage.tsx` and `pages/internal/InternalRecommendationsPage.tsx`
    (both lean on `agent-portal-*` CSS classes / literal Bootstrap-blue "Queue Review Modal"
    chrome already flagged elsewhere in this doc as Phase 4 territory, not a Phase 2/3
    mechanical token swap — touching only the 2-3 stray hex values on top of unreconciled
    agent-portal CSS would patch inconsistently rather than fix). `Kanban` card-state border
    colors and `playerLists.theme.ts`-sourced colors (e.g. `KanbanPage.tsx`'s save-progress
    error text, which mixes frozen `colors.gray[700]` with a literal `#b91c1c` — can't cleanly
    fix half of a frozen-coupled expression) — untouched, per the existing freeze.
  - Full Track 1 verification (`tsc`, `eslint` diffed against the pre-round baseline via
    `git stash`, zero-emoji scan, frozen-file diff against `main`) — all clean, identical
    warning counts, zero errors, zero frozen-file changes. Live-verified in an
    already-authenticated browser tab (existing session, not a new login) before it expired:
    homepage, `ScoutingPage.tsx` cards + Cards/Table toggle + Player Assessment Report modal
    (chart colors, close button computed style confirmed `opacity: 0.9` / correct invert
    filter). Everything from this round past that point (`AnalyticsPage.tsx`,
    `PersonalAnalyticsPage.tsx`, `KanbanPage.tsx`, the other modals) is Track 1 + code-review
    verified only, not yet seen live — same standing limitation as every prior round.

**Phase 3.5 — Interaction states: hover, loading, shimmer.**
Explicitly called out by the user as its own workstream: "incorrect loading states, not proper
loading states, shimmer animations all need work." One data point already checked:
`ShimmerLoading.tsx` / `.shimmer-line` / `.shimmer-card` (`professional-theme.css`
~L2226-2298) already have a real `[data-bs-theme="dark"]` variant (different gradient stops,
dark card bg/border, even a `prefers-reduced-motion` fallback for both themes) — so shimmer is
not universally broken, whatever's wrong is likely narrower (a specific loading spot, a
specific page) or about correctness/timing rather than color. Still to audit: spinner usage
consistency across pages and loading-state correctness (right skeleton shape for the content
it precedes) — needs its own survey pass; don't assume the shimmer data point generalizes.

**Loading-language decision (explicit, per user request):**
- **Shimmer** = the default for *content* that's about to render in a known shape: report
  lists, tables, cards, search results. The skeleton should approximate the real layout it's
  about to replace (line-height/width proportions matching the actual text it stands in for),
  not a generic grey block — a mismatched skeleton reads as "incorrect loading state," which is
  exactly what the user flagged.
- **Spinner** = reserved for *actions* with no predictable content shape: form submits, button
  clicks, PDF export, save/delete confirmations. A spinner on a button or over a modal, never a
  full page.
- **Never both** for the same loading event — a spinner inside a shimmer card (or vice versa)
  is the "not proper loading state" pattern to eliminate wherever found.
- Any full-page load (initial page mount before data arrives) should prefer a shimmer skeleton
  of the page's real layout over a centered spinner, consistent with the content rule above —
  `PlayerProfilePage.tsx`'s own `.loading-container`/`.loading-content` (currently a centered
  spinner + text) is a candidate to convert during that page's next visit, not yet done.

**Rendering strategy: progressive, section-by-section — not one gate for the whole page.**
When a page fetches multiple independent things (e.g. `PlayerProfilePage.tsx`'s profile header,
scout reports, flow history, and attribute scores are four separate requests), each section
should show its own shape-matched skeleton and swap in as soon as its own data arrives, rather
than blocking the entire page behind a single spinner/shimmer until the slowest request
finishes. Reasons, in order:
- **Perceived speed.** A page that paints its header and known-fast sections immediately reads
  as faster than one that shows nothing until everything is ready, even when total load time is
  identical.
- **Failure isolation.** If one section's request fails or is slow (e.g. flow history), the rest
  of the page shouldn't be held hostage — it should render normally and let that one section show
  its own error/retry state.
- **It's what `AnalyticsPage.tsx` already does, correctly**, and is worth treating as the
  reference pattern: the page shell only gates on the permission check (`userLoading`); each tab
  component (`StageMovementAnalyticsTab.tsx`, `PlayerAnalyticsTab.tsx`, etc.) owns and renders
  its own loading state independently. `PersonalAnalyticsPage.tsx` does this partially too —
  page-level `loading` gates the summary stats, a separate `reportsLoading` gates only the
  reports table underneath.

**Exception — gate together when sections are visually or logically coupled.** If several pieces
of UI are meant to be read as one unit (e.g. a summary card whose fields all come from the same
response, or a chart plus its legend), splitting them into independently-arriving fragments
causes layout jitter and half-rendered-looking states that are worse than a single brief wait.
Rule of thumb: **one skeleton per independent fetch, not per DOM element** — group sections that
share a request behind one shimmer, and give sections with their own request their own shimmer,
timed to when that specific data resolves.

**Per-page scope, current state vs. target (Track 1 mechanical + Track 2 visual, per page):**

| Page | Sections w/ independent loads | Current state | Target |
|---|---|---|---|
| `HomePage.tsx` | page shell; per-row action (view report) | Page shell already uses a hand-built shimmer skeleton (header + 3-card grid) — **reference pattern, no change needed.** Row actions correctly use inline spinners. | No change. |
| `PlayerProfilePage.tsx` | profile header/tabs shell; scout reports list; flow history; attribute scores; per-row actions | Shell = centered spinner (documented candidate, not yet converted). Scout reports + flow history = inline text-with-spinner (`"Loading scout reports..."`, `"Loading flow history..."`). **`attributesLoading` state is declared and set but never read anywhere in the render** — the Attribute Analysis section currently has *no* loading indicator at all, it just pops in empty→populated. This is the clearest concrete "incorrect loading state" bug found this pass. | Shell → page-shaped shimmer. Scout reports + flow history → each gets its own `shimmer` list skeleton (they already load independently, keep it that way). Attribute section → wire `attributesLoading` to an actual shimmer skeleton of the score-bar layout (currently silently dead code). |
| `PlayerListsPage.tsx` / `KanbanPage.tsx` | list/board shell; add-player search; membership popover | Shell = centered spinner ("Loading player lists..."). Search/add/membership = correctly-scoped inline spinners (async actions, no predictable shape). | Shell → shimmer matching the list/card grid or kanban column skeleton. Leave the action spinners as-is. |
| `AnalyticsPage.tsx` | page shell (permission gate only); each tab owns its own data load | Shell = spinner, but it's gating a *permission check*, not content — arguably fine as a spinner since it's genuinely unpredictable-shape (could deny access). Each tab component has its own `Spinner`, not shimmer. | Shell: leave as spinner (action/gate, not content). Each tab: convert to a shimmer matching that tab's chart/table shape — same "own request, own skeleton" pattern already correctly structured, just wrong mark type today. |
| `PersonalAnalyticsPage.tsx` | page shell; reports table; per-row report load | Already two-tier (page `loading` + separate `reportsLoading`) — good structure. Both currently render as spinners. | Keep the two-tier structure. Page shell → shimmer of the stats-card layout. Reports table → shimmer table rows (shaped to its actual columns, not the generic `ShimmerLoading` "table" variant, which is a different column shape). |
| `AdminPage.tsx` | 3 independent tabs (Data Quality incl. 2 sub-tabs, User Management, System Ops) | Each tab/sub-tab loads and renders independently already (`loadingUsers`, `resetLoading`, plus `DataClashesTab`/`InternalPlayerAuditTab` have their own spinners) — correct isolation. All currently spinners. | Convert User Management's table load to a shimmer table (shaped to its own columns). Data Quality sub-tabs and System Ops' one-off action (generate reset link) stay spinners — the former is closer to a data grid worth shimmer, the latter is a real single action. |
| `IntelPage.tsx` / `ScoutingPage.tsx` | report list/table | Already correctly using `ShimmerLoading` (`card`/`table` variant) — **reference pattern.** | No change. |
| `SharedReportPage.tsx` | whole page (single fetch, single token) | Centered spinner — appropriate here specifically, since there's exactly one request gating exactly one shape and no independent sections to stagger. | Leave as-is; not a violation of the rule, just a page with nothing to make progressive. |
| `ExternalRecommendationsListPage.tsx` / `internal/InternalRecommendationsPage.tsx` | list; per-row history expand | Deferred with the rest of this pair (Phase 4-adjacent, see above) — noted here for completeness, not scoped further yet. | Revisit alongside Phase 4. |

**Key finding to lead with:** the only outright *bug* (not just a stylistic mismatch) found in
this pass is `PlayerProfilePage.tsx`'s dead `attributesLoading` state — it's tracked but never
consulted, so that section has no loading state at all today. Everything else in the table above
is "spinner where a shimmer would better match the loading-language rule," which is a real but
lower-severity gap than a section with zero loading feedback.

**Phase 3.5 — build-out, done.** All six pages/sub-widgets from the target matrix converted:
- `PlayerProfilePage.tsx`: fixed the dead `attributesLoading` bug (Attribute Analysis section
  now shows a circular-chart-shaped shimmer instead of no feedback at all); page shell, flow
  history, and scout reports converted from spinner to shape-matched shimmer (the latter reuses
  `ShimmerLoading`'s `card` variant, since it's genuinely the same report-card shape it was built
  for). Removed the now-dead `.loading-container`/`.loading-content` CSS.
- `PlayerListsPage.tsx` / `KanbanPage.tsx`: shell spinner → shimmer matching the filter-pills +
  card-grid layout and the multi-column board layout respectively.
- `AnalyticsPage.tsx` tabs: new shared `components/analytics/AnalyticsDashboardShimmer.tsx`
  (stat-row / chart-block / table-block, each independently toggleable via props) rather than
  four bespoke one-off skeletons, since `MatchTeamAnalyticsTab`, `ScoutAnalyticsTab`,
  `StageMovementAnalyticsTab`, and `PlayerAnalyticsTab` all share the same underlying dashboard
  shape (they just show/hide pieces of it) — genuine reuse, not the mismatched-shape trap. Two
  nested sub-widgets (`AttributeFilterSection`'s attribute grid, `EnhancedTimeline`'s bar chart)
  converted separately since they load on their own schedule inside the tab.
- `PersonalAnalyticsPage.tsx`: shell → `AnalyticsDashboardShimmer`; reports table → a bespoke
  shimmer tbody matched to its actual 10-column layout (deliberately *not* the generic
  `ShimmerLoading` `table` variant, which is an 11-column shape built for a different table).
- `AdminPage.tsx`: User Management table → shimmer tbody matched to its own 6-column layout.
  Left as spinners, per the matrix: `AnalyticsPage.tsx`'s own shell (a permission gate, not
  content), and every actual button/save/delete action spinner across all of the above.
Verified via `tsc --noEmit` (clean) and `eslint` per changed file (zero new warnings vs. `main`
baseline) plus a frozen-file diff (`colorUtils.ts`, `playerLists.theme.ts`, the three Kanban
card-state-border files, `ScoutingAssessmentModal.tsx`) — all empty. Not yet re-verified live in
the browser (same standing auth-blocked-screenshot limitation as every prior round).

**Phase 4 — Agent Portal reconciliation.**
`pages/agents/*` / `components/agents/*` currently has its own distinct look (slate
`#0f172a`, unloaded 'Inter' intent, `#cc0000`). Bring onto the same token system as a
harmonized "external" variant, not a third unreconciled look. Adopt the stale branch's idea
of one shared auth-page layout between internal login and agent login, properly this time.

**Phase 5 — Cleanup & verification.**
Remove now-dead tokens/CSS as pages migrate off old classes. Full verification pass (below).

## Empty states

Added per explicit user request. Not yet built — this section records the design direction so
it doesn't get reinvented ad hoc per page.

- **Motif: the club crest, faint, as a watermark.** User's own suggestion, confirmed: a large,
  low-opacity version of the club crest sitting behind/within an empty-state panel (e.g. "no
  reports yet," "no players in this list," the radar chart's "no attribute data" branch) —
  reinforces "empty," not "broken," and ties the empty state back to the brand anchor
  (Charlton crest) rather than a generic icon-and-caption box.
- **Explicit exclusion, confirmed by the user: never on PDF export.** Exported report PDFs
  must not carry the crest watermark even where the on-screen equivalent shows it — it's a
  screen-only affordance, not part of the printed/exported artifact. Whatever component ends
  up rendering the watermark needs a prop/flag to suppress it specifically in the
  `html2canvas` export path (the same code path already has to special-case dark-mode chart
  colors before capture — see `PlayerReportModal.tsx`'s `handleExportPDF`, add this alongside
  it rather than as a separate mechanism).
- **Existing precedent, not yet unified:** `components/PlayerLists/EmptyState.tsx` is the only
  dedicated empty-state component today, scoped to one page. Everywhere else, "empty" is an
  inline `text-center text-muted` paragraph (e.g. `PlayerProfilePage.tsx`'s `.empty-state`
  class, now tokenized for dark mode but still just a caption, no watermark). Consolidating
  these into one shared component (crest watermark + heading + caption + optional action) is
  the natural next step once this section is acted on, following the same
  "component wraps the design decision once" pattern already used for `GradeChip`.
- Scope: applies to genuinely-empty states (no data exists), not loading states (Phase 3.5,
  shimmer) or zero-result search/filter states (arguably still "empty," worth revisiting
  whether those should carry the same treatment or something lighter — not decided).

## Elevation scale

Added per explicit user request. Today, shadows are ad hoc inline `box-shadow` values repeated
per component with no shared scale (e.g. `PlayerProfilePage.tsx`'s embedded stylesheet alone
has `rgba(0,0,0,0.05)`, `0.08`, `0.1`, `0.15` all in play for what are conceptually the same two
or three levels of "how raised is this"). Proposed consolidation, three levels:

- **Resting** — the default raised-card state (page-level cards, list rows): `0 2px 8px
  rgba(0, 0, 0, 0.08)`.
- **Raised** — hover/focus lift, or a card that needs to stand out from sibling cards on the
  same page (e.g. an expanded/selected state): `0 4px 16px rgba(0, 0, 0, 0.12)`.
- **Modal** — anything in an overlay (modals, dropdowns, popovers): `0 10px 40px
  rgba(0, 0, 0, 0.15)` — matches what `PlayerProfilePage.tsx`'s `.clean-modal .modal-content`
  and `Navbar.tsx`'s search dropdown already independently converged on, so this is
  formalizing an existing convention more than inventing a new one.
- Values are intentionally unchanged between themes for now — a black shadow at low opacity
  reads as "recessed/raised" against both a light and a dark surface; revisit only if a
  specific dark-mode case shows the shadow disappearing against a dark background.
- Not yet wired up as reusable tokens (e.g. `--shadow-resting`/`--shadow-raised`/
  `--shadow-modal` in `ThemeContext.tsx` or `professional-theme.css`) — this section records
  the target scale; migrating existing inline `box-shadow` values onto it is Phase 5 cleanup
  work, done opportunistically per page like the rest of the radius/font-size consolidation
  already decided in Phase 1.

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
- `Navbar.tsx` hardcoded-hex audit (Phase 2) found two theme-independent overlay blocks.
  - **Superseded (see Track 2 round 3 above):** the search-results dropdown was originally
    assumed to be "a coordinated fixed-light pair" left hardcoded by design, and an early
    attempt to tokenize just the JSX text was reverted after it broke contrast. That diagnosis
    was wrong — the actual cause was a second, `!important`-flagged rule set in
    `professional-theme.css` (`.navbar-search-input`/`.navbar-search-dropdown`/
    `.search-result-item`, L1511-1636) silently overriding the JSX's inline tokens regardless of
    what the JSX said. Round 3 tokenized that CSS block too, so foreground and background now
    move together under one system. Not yet re-verified by the user in their browser.
  - The Queue Review Modal (~lines 851, 862): `Modal.Header` (`#007bff` bg, white text) and a
    `Card` (`#f0f8ff` bg, `#007bff` border) — literal Bootstrap-blue chrome, not brand tokens,
    left hardcoded and untouched this round (not raised by the user; still an open Track 2 call
    on whether it should move onto the app's red/graphite palette and/or theme-swap).
- **Track 2 round 6 — `SharedReportPage.tsx` dark-mode wiring (supersedes the earlier
  "leave it fixed-appearance" deferral).** The user clarified this page should follow the same
  styling/typography/feel as the rest of the app, including dark mode, not stay a frozen
  external artifact. Wired up `useTheme` and tokenized: the page background
  (`var(--color-background)`), body text color, the two small muted/label text colors (`#666`
  → `var(--color-text-muted)`, `#333` → `var(--color-text)`), and the PolarArea chart's
  point-label text color (theme-aware `#212529`/`#e5e7eb`, since this is axis-label text, not
  part of the frozen radar-group triad). The Strengths/Areas-for-Improvement panels (previously
  fixed light-green/light-amber tints) now swap to translucent dark-mode-appropriate tints in
  dark theme, and their badges now consume `theme.colors.success`/`theme.colors.warning`
  (the existing frozen tokens, unchanged values) instead of hardcoding the same hex literally.
  Left untouched, all confirmed frozen/intentional: the `getAttributeGroupColor` triad
  (`#009FB7`/`#9370DB`/`#7FC8F8`) and its legend swatches; the chart's white datalabel text
  (sits on colored chart segments, matches the pattern elsewhere); the `Card.Header`
  `bg-light`/`text-dark` combo on the flag-report branch (already forced to the app-wide dark
  `#212529` header by a global `professional-theme.css` rule, so no page-specific fix needed);
  and the PDF-export `html2canvas` capture background (`#ffffff`, intentional — exports render
  on light/paper background regardless of theme, consistent with the earlier PDF-export
  exclusion decision for the crest watermark). Verified via `tsc --noEmit` and `eslint` (both
  clean) and a frozen-file diff against `main`. Not yet re-verified by the user in their
  browser (same auth-blocked-screenshot limitation noted above — this page is unauthenticated
  by design, but real report data needs a live share token to render).

- **Track 2 round 5** — swept the remaining Phase 3 internal-app pages for leftover hardcoded
  hex not covered by the earlier chrome/close-button passes: `IntelPage.tsx` (card border,
  player-name link color in both table and card views, card title text color — all now theme
  tokens) and `IntelModal.tsx` (the "Selected player" info box background, previously a fixed
  light-blue `#eef3f7`, now `var(--color-background)`). `AdminPage.tsx` and `KanbanPage.tsx`
  were re-audited and found already clean (no hardcoded hex outside the already-approved brand
  primary and player-name-link pattern). This closes out Phase 3 for the pages that are purely
  internal-app surfaces. Verified via `tsc --noEmit` (clean) and `eslint` on the two changed
  files (clean); frozen-file diff against `main` (`colorUtils.ts`, `playerLists.theme.ts`)
  confirmed empty. Not yet re-verified by the user in their browser (same session
  auth-blocked-screenshot limitation as above).
  Three pages remain deliberately deferred, unchanged from earlier reasoning:
  - `SharedReportPage.tsx` — no `useTheme` wiring, reads as an intentional fixed-appearance
    external-facing artifact; needs explicit confirmation before wiring up dark-mode support.
  - `ExternalRecommendationsListPage.tsx` / `pages/internal/InternalRecommendationsPage.tsx` —
    lean on `agent-portal-*` classes, entangled with the Phase 4 Agent Portal reconciliation
    rather than a standalone token swap.

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
