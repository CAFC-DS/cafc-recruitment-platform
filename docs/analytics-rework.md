# Recruitment analytics rework

## Scope and authority

The `/analytics` page is a scoped whole-page rework for internal Charlton recruitment staff, within the coherent incumbent React/TypeScript, FastAPI and Snowflake platform. Preserve branding, permissions, data and core workflows. The wider platform redesign is out of scope. This documentation does not replace global DESIGN.md or `.impeccable/design.json`.

The approved direction is represented by `.impeccable/mocks/analytics/06-production-overview.png` and `07-production-pipeline-detail.png`. The implementation is a code-led adaptation of those concepts. It is not a measured comp-led reproduction: no formal comp phase, comp state, measurement specification or comp-diff evidence was produced. Screenshot review supports inspection of the implementation, not a claim of formal comp parity.

## Experience

Retain the horizontal platform navigation, Charlton identity, IBM Plex typography, theme support, centred workspace and restrained red actions. The overview is a tabbed workbook (chosen by the user on 27 Oct 2026): title and applied scope with filters underneath, one ruled strip of five clickable headline figures, then tabs for Pipeline, Market coverage, Positions & locations and Activity (`?view=pipeline|coverage|map|activity`, the same values earlier links used). Drilldowns open in place directly under the tab panel with a breadcrumb and Close; Escape closes, and closing scrolls back to where the click happened. The URL still carries the drilldown, so links and the back button work. An "Analytics sections" bar sits above the page: Overview (this rework) plus the original Player, Match & team, Scout and Stage analytics sections, which keep their own filters and behaviour. The URL `section` parameter selects a section; overview filters stay in the URL alongside it, so returning to Overview restores the previous context.

Dates, stage and market filters apply across the experience. Additional filters cover playing country, position, club, scout and live/video method. The URL is the applied-filter source, distinct from editable filter drafts; it preserves context for drilldowns and browser navigation. Cancel obsolete requests to prevent older responses replacing current results. Provide loading, empty, permission, retry and paginated detail states. Player details link to existing profiles.

## Metric contract

- Report dates use report creation time; movement dates use recorded event time, with inclusive selected dates. Recruitment stage is evaluated at the selected end date where retained history supports it.
- Fixture and player totals are distinct counts. Live and video can overlap on the same fixture; show that overlap. Count non-archived assessment and flag reports.
- Senior scouts are Phil Chapple (USERS.ID 302) and Calvin Charlton (303), matched by user ID. Senior coverage is filtered covered players with at least one report by either senior during the period, divided by all filtered covered players. Senior scout reports is the count of their assessments and flags in the period.
- First-team pipeline headlines count unique new entrants, players progressing to a higher stage and archived players. Inspectable movement events are separate from distinct-player headlines.
- The Sankey represents recorded Stage 1–5 transitions. Forward moves (including skipped stages) run left to right; each stage's archive exits drop straight down into an Archived bar so they never cross the forward path; moves back a stage and restorations from the archive are listed as chips beneath. Node labels show the end-date stage total next to the period's in/out movements, so the two are not read as one total. Hovering reads out a flow or stage; selecting keeps it lit and lists its players below. Movements with no previous stage after a player's first entry appear as a "List additions" source node, stacked under New entrants. Incoming and outgoing node counts describe events; they are not conserved single-cohort totals. Current or end-date stage snapshots are separate from transition counts.
- Market = players currently registered at a club in the selected leagues, playing country, position and club (players with no current club are excluded; they still count as covered players). Team coverage = clubs with at least one current player reported in the period ÷ clubs in the market. Player coverage = covered players at a club ÷ players at a club. A league-by-league table shows both. Earlier wording, kept for history: coverage denominators include all known players and clubs in the selected competitions, playing country, position and club. Stage, scout and method filters narrow coverage numerators, not the available market denominator. Display denominator context, team and player percentages and accessible club breakdowns.
- The map locates current playing country from available club fixture records, never nationality. It offers World/Europe views, Stage 3–5 toggles, country detail and missing-location counts. Markers use approximate country centres, not club coordinates.

## Data limits

Market membership reflects current available club membership, not a reconstructed historical transfer register. Playing-country assignment uses the latest available club fixture information and country-centre mapping; it cannot establish exact club locations or historical playing geography. Recruitment snapshots and movements depend on retained history. Missing history remains unknown: do not reconstruct previous stages backwards from today's stage or imply complete historical totals. Source rows are cached for two minutes, so refreshes may reuse the same source snapshot.

The local simplified country boundaries derive from the public-domain [Natural Earth country dataset](https://github.com/datasets/geo-countries).

## Implementation and review evidence

Primary frontend implementation: `frontend/src/pages/AnalyticsPage.tsx`, `frontend/src/pages/AnalyticsPage.css` and recruitment analytics components. Page styling consumes incumbent theme variables, Charlton red (`#b91c1c`), IBM Plex typography and stage semantics rather than establishing a global token system. Existing stage colours remain grey / amber / blue / green / purple, with red for archived status; labels carry meaning alongside colour.

Actual implementation review captures exist in `.impeccable/review/`: `desktop.jpg`, `pipeline-mobile.jpg`, `mobile.jpg`, `coverage-desktop.jpg`, `coverage-mobile.jpg` and `map-desktop.jpg`. Final detail captures are being added separately; they are not claimed as completed evidence here.

Read-only live warehouse validation succeeded against canonical sources: 123,515 player rows, 8,131 reports, 3,157 list items and 7,089 history rows. Production data was not modified. UI preview uses synthetic data through the actual endpoint and aggregator. At this documentation checkpoint, reported targeted validation comprises 11 backend tests, 3 frontend tests and 5 endpoint validation checks; this records the implementation validation supplied for the work, not a fresh test execution by the documentation pass.

## Documentation provenance

Before this pass, root PRODUCT.md and this implementation note were absent; the existing analytics surface brief supplied scoped context. The document reference was read for its documentation principles, but its general global-design generation workflow does not authorize expanding this settled page scope. No global visual-system files were generated or replaced, and no additional discovery or comp evidence is implied.

## Final verification checkpoint

- 17 backend tests passed: aggregation, namespaces, stage history, market denominators, map country, endpoint permissions and validation, and cached endpoint filtering.
- 3 UI flow tests passed: URL filters survive drilldown/return, shared stage filters and error retry, and unauthorised users do not fetch analytics.
- TypeScript checking, changed-file lint, production build and diff whitespace check passed. Existing unrelated lint warnings remain in the wider app.
- Final finish-review verdict: ship for the three scored fixes (readable mobile pipeline, explicit code-led documentation, expanded selected-movement evidence). This is a fix-list verdict, not a claim of pixel-measured comp fidelity.
- Expanded detail evidence: `.impeccable/review/pipeline-detail-desktop.jpg`. Updated readable mobile pipeline: `.impeccable/review/pipeline-mobile.jpg`.
- Local browser preview uses synthetic rows through the real endpoint/aggregator. Live warehouse queries were separately validated read-only. Production remains unchanged.

## Continuation checkpoint (27 Oct 2026)

Work resumed in Claude Code after the Codex session ended. Changes since the checkpoint above:

- Branch brought up to date: `origin/cutover/full` (39 commits, including Stage 5 and preserved stage edits) fast-forwarded into `codex/analytics-rework`; the uncommitted analytics work reapplied without conflicts.
- Original analytics sections restored alongside the overview (see Experience), with a UI test that every section is reachable.
- `/analytics/matches-teams` timed out against CAFC_DB: its OR-condition join to `matches` (external `ID` / internal `CAFC_MATCH_ID`) cannot hash-join. The endpoint now joins on a derived `JOIN_MATCH_ID`; identical rows (11,308 joined, 11,284 reports), 24.2s → 1.0s for the join, about 5–7s for the whole endpoint. Other endpoints still use the OR join and were not changed.
- Sankey: extra nodes such as "List additions" were drawn on top of the Archived node. Pure source nodes now stack under New entrants (captioned as entries), other extras under Archived, and the chart height grows to fit. Covered by `PipelineChart.test.tsx`.
- Coverage bars, the player detail table and the position filter show readable position names (e.g. "Centre-forward") instead of warehouse codes.

Verification: 32 backend tests (analytics, endpoint, match/team refresh, Stage 5), 5 frontend tests and TypeScript checking pass. Browser review ran against real CAFC_DB data (`CANONICAL_DB=CAFC_DB`, `PLATFORM_DB_SCHEMA=APP_COMPAT`, `CORE_DB_SCHEMA=CORE`) through a local server that injects a preview admin user and rejects every non-GET request; no data was written. Reviewed: overview metrics, all four views, a pipeline drilldown with profile links, each restored section, and the pipeline at 390px width.

## Restyle and data checkpoint (27 Oct 2026, Claude Code + impeccable)

Requested by the user: every key number easy to find, filterable by date, stage and basic filters; correct linking; a defined market coverage; less overlap in the stage graphic; first step of the platform-wide style refresh.

Decisions confirmed with the user: seniors are Calvin Charlton + Phil Chapple (Hashim Umarji has no reports); market = players at a current club; stage ladder over Sankey; a committed shell (deep-ink band) inside the incumbent identity.

Data findings and fixes (checked against CAFC_DB, read-only):

- "0 reports" on listed players: the count was period-only. Of 3,666 listed/covered player rows in the default 90 days, 2,063 showed 0; 1,723 of those have reports outside the period. Drilldowns now show "Reports in period" and "All-time reports". Of the remaining 340 with no live report, 126 only have archived flags, 19 only archived clips and the rest were added to a list without a report. Linking itself is sound: 7 of 8,137 reports reference players missing from the players table, and one sampled "missing" assessment was simply created after the snapshot.
- Market coverage was 1,603 / 123,515 = 1.3% because the denominator included 56,399 player rows with no club. Now 1,504 / 67,116 = 2.2% (players) and 489 / 3,138 = 15.6% (teams) for the default period; 102 covered players have no current club. Each figure opens a matching drilldown (`detail=players&market=1`, and the club table notes how many clubs are covered).
- Clubs were counted once per league any of their players appeared in (4,511 club entries; League Two had 32 clubs because single non-league or U18 players carried a stray League Two competition). Each club now takes the league most of its players are in: League Two 24, Championship 24, Premier League 20, 3,138 clubs in all. Small residual noise (e.g. an U18 side in League One) comes from the source competition mapping.
- Club countries arrive partly in German on CAFC_DB ("Frankreich", "Vereinigte Staaten"), so 848 of 1,606 covered players could not be mapped. Country names are now normalised to English in the aggregator; the map also places small states without outlines.
- Senior scouts are matched by user ID, not display name.
- Fixtures show "Home v Away" and date instead of a bare ID (one row per report; duplicated fixture rows in matches are collapsed). Source cache key bumped to `_v2`.
- Stage drilldowns use a detail-only `stage` parameter; previously they changed the overview's global stage filter.
- Position counts use every covered player (matching the drilldown); the percentage is that position's market share.

Every headline was reconciled against its drilldown (fixtures 400, players 1,606, reports 2,035, senior reports 446, senior players 393, each stage total, ladder flows, a country, a position, market players 1,504 and covered clubs 489). The restored specialist sections keep their original styling: new rules are scoped to `.ra-overview`.

Style: tokens are scoped to `.ra-page` in `AnalyticsPage.css` (ink band, surfaces, data colours) so they can be lifted platform-wide later. Headline figures and titles use IBM Plex Sans Condensed, the platform's existing display role. Dark mode now keys off `data-bs-theme="dark"` / `body.theme-dark` (the previous `data-theme` selector never matched). Known outside scope: the platform navbar overflows horizontally at ~1000px width.

Verification: 38 backend tests and 5 frontend tests pass; TypeScript and ESLint clean; impeccable detector clean. Reviewed in the browser at desktop, 1024px and 375px, light and dark, against real CAFC_DB data through a local read-only review server.

## Workbook rework (27 Oct 2026, later the same day)

The user rejected the deep-ink band and the stage ladder ("doesn't feel premium or professional") and asked for the Sankey back, better drawn, with drill-in and drill-out that is easier to follow. Three layout structures were put to them on the impeccable decision page; they chose the tabbed workbook (recorded in `.impeccable/surfaces/analytics.md` under Direction contract).

- Page: light ground, IBM Plex, Charlton red only for the primary action and selection. Headline figures sit on a ruled strip (2px ink rule over, hairlines between), not in boxes or a dark panel.
- Sankey (`PipelineChart.tsx`): laid out at its real rendered width so text stays at true size; ribbons ordered to reduce crossings, coloured with source-to-target gradients; archive exits drop into a bottom bar; backward moves as chips; a readout line names whatever is under the pointer; the selected flow stays lit while its players are shown.
- Drill in/out: the detail panel expands under the chart with a 240ms reveal, carries a breadcrumb (e.g. Pipeline › Stage movements) and Close; closing collapses it (180ms), clears the URL drilldown and scrolls back. Reduced motion skips the animation.
- The stage ladder component was removed. Data fixes from the earlier checkpoint are unchanged.

Finish review (impeccable finish reviewer, two rounds): verdict ship for its eight fixes. These were: drill-in keeps the selected flow on screen and closing glides back; focus moves to the panel heading and returns to the clicked element; dark-mode reds meet AA; title and filters share a row where they fit (≥ ~1400px) and wrap as a group below; red only on actions and selection; a real breadcrumb; the phone sections bar loses its scrollbar; single-flow tables drop the repeated Movement column. Not inspected: the 375px Sankey and drilldown screens, and the non-Pipeline tabs beyond source review. Captures are in `.impeccable/review/*.png`.

## Critique follow-up (27 Oct 2026)

A dual-agent impeccable critique scored the workbook 24/40; the snapshot is in `.impeccable/critique/`. Measured on real data, every filter changes every tab, but the page did not say so. The user chose these fixes:

- **Filter scope:** each tab opens with a "Filtered by" line, showing the date range plus a chip for every active filter (× removes it), and one sentence on how filters apply to that tab. On Market coverage, for example: "League, country, position and club set the size of the market. Dates, stage, scout and method only change who counts as covered." This replaced the market paragraph note.
- **Stage on end date:**
  - toggle chips in stage colours, with any combination allowed (the backend already accepted `Stage 3|Stage 4`) and a "Shortlist (Stages 3–5)" preset
  - "Unlisted" and "Unknown" now read "Not on a list" and "No history"
  - the scope line lists stages with commas
- **Leagues:** a searchable checklist with ticked leagues pinned at the top. It replaces the Ctrl/⌘ multi-select.
- **Entry terms:**
  - "New entrants" now reads "First time on a list": the player's first ever entry on any first-team list.
  - "List additions" now reads "Re-added to a list": a player who had been on a list before, re-listed or put on another position list.
  - Definitions show on hover and in the readout. Re-adds have their own colour.
  - Counts carry units: players in the headline stats, movements on the chart.
- **Copy:**
  - "refreshes every 2 minutes" is now "data up to 2 minutes old" (it is a cache, not an auto-refresh)
  - the "All …" options read naturally ("All positions", "Live and video")

Not done (offered, not chosen): a dirty state on Apply, undo for league clicks, a muted archive colour, and the remaining minor copy items.

## Platform-style rebuild (27 Oct 2026, latest)

The user found the workbook still "too much like AI slop". The specific causes they named were the pills and chips, the big condensed numbers, and too much explaining. They asked for the page to match the rest of the Charlton platform rather than a new look. The overview now uses the platform's own components and patterns, the same ones as Player analytics:

- **Filters:** a "Filters:" card with date inputs and two multi-select dropdowns: Stage, which has a "Shortlist (3–5)" shortcut, and League, which is searchable. Both use the shared `PositionMultiSelect`, which gained optional props whose defaults keep its existing users unchanged. A "More filters" row covers position, country, club, scout and method. "Apply Filters" is dark and stays disabled until something changes. A "Filter Info" tooltip holds the explanations that previously sat on the page.
- **Figures:** five `SimpleStatsCard`s.
- **Sections:** stacked cards with the platform's dark header and red rule: Stage movement (the Sankey), Market coverage (two stat cards and a league table), Players covered by position (a table), Where they play (the map), and Activity (monthly bars and a senior scout table). The inner tabs, per-tab chips and footnotes are gone.
- **Drilldowns:** a card opens directly under the section that was clicked, with a dark header, search and Close, and a compact striped table. The URL `view` parameter records which section the drilldown belongs to, and older `?view=` links scroll to that section.
- **Sankey:** labels are plain Plex Sans, move-back flows show as plain links, and the explanatory notes are removed.
