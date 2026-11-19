# Technical data tab on the player profile

Branch: `feature/technical-data-tab` (from `origin/cutover/full` at 91a320c). Mode: Operate, extending the existing profile page. It keeps the profile's incumbent look: IBM Plex, Charlton red for the active tab only, and the Data Score band colours.

Visual options: `.impeccable/mocks/technical-data/technical-data-options.html` (published privately as an artifact). The category scores in the mock are real. The metric values are illustrative.

## Goal

Add a **Technical data** tab beside **Profile** that breaks the player's Data Score into its position categories. The categories are shown as a polar area chart, like the assessment report's. Each category then drills into the metrics behind it, the way the unmerged `codex/technical-data-redesign` trait breakdown did.

## Decisions taken (18 Nov 2026)

- **Drill-down data comes from data-scoring.** The weekly publish will package each metric's Championship score and per-90 value. The platform does not recompute anything, so the metrics always agree with the category score.
- **Drill-down pattern** follows the old codex trait branch: category, then its metrics, each with its own bar.
- **Scale:** everything is on the Championship scale (100 = Championship average at the position, 10 = one Championship standard deviation), categories and metrics alike. There is no league-percentile view (dropped 18 Nov). Metric Championship scores already exist inside data-scoring: `championship_translation.py::_index_raw` computes a Championship z-score for every metric (transform, standardise against the Championship reference, clip ±4, sign-correct) and averages them into the category index. We only need to stop throwing them away.
- **Layout (approved 18 Nov):** a scouting-report page on the platform's light theme. A context line (position, club, league, minutes, small-sample warning) with a season dropdown. Left: a category radar and a Category / Score / Level table (Level = the Data Score band name). Right: "What makes up each score", flat bars, one per metric, grouped and coloured by category, drawn up or down from a solid line at 100, with the score printed on each bar and the category name + score above each group. Hover shows the metric's per-90 value; clicking a table row picks that category out in both charts. The chart on the left is an outlined category radar for the selected season (changed 19 Nov from a per-metric polar, which repeated the bar chart), with a dashed shape at 100 on a fixed 70–130 scale. A season-comparison overlay was tried and removed on 19 Nov. Colours: steel blue, teal, ochre, brick, plum (fifth category). Earlier rounds (drill-down panels; a dark Traits clone with gradient bars and bubbles) were rejected as busy or AI-looking. Recorded as a surface brief in `.impeccable/surfaces/` (target `frontend/src/components/player/TechnicalDataSection.tsx`).
- **Frontend consequence:** a Chart.js `Radar` for the categories and a bar chart (or plain SVG) for the metrics, with bars drawn from a baseline at 100. Metric labels must be short (≤ 20 characters, wrapping onto two lines under each bar), so `meta.positions[pos].metrics[].label` needs a short label.

## What exists today

- `backend/services/data_scores.py` reads `published/<run>/cafc_scout.html` from the `scout-data` bucket. It keeps only the headline columns (`ch`, `fc`, `rel`…). It ignores `catOwn`, `catCh`, `fit` and `best`, even though the page already carries them.
- `GET /players/{id}/data-scores` is admin and senior manager only. `PlayerDataScore.tsx` shows the header box and popover.
- Categories per position come from `d-meta` `positions[pos].categories`. Strikers, wingers, AMs and DMs have 4 categories. CBs, FB/WBs and CMs have 5. Goalkeepers are paused (N/A).
- The metrics behind each category are defined in data-scoring `python/categories_v2.json`. Each category has 2–3 metrics with equal weights. Per-metric percentiles are computed in `build_v2_data.py::_metric_pctl` and then thrown away.
- A Technical Data tab existed and was removed in 5f48901 (16 Oct, during the profile performance work). Its tab switcher markup and the `?tab=technical` handling are a good starting point. The lesson from that removal: the tab must be lazy-loaded and must fetch nothing until it is opened.

## Part 1: data-scoring (already done, 18 Nov)

Checked 19 Nov: data-scoring `main` (7744b8a, 18 Nov) already has `python/build_metric_breakdown.py`, which writes `dashboard/scout/data_v2/metrics_<position>.json`: `{categories: [{key, metrics: [{key, label, percent, lower_better}]}], rows: [[value, reading, ...]]}`, one row per `<position>.json` row in the same order. A metric's reading is on its category's Championship scale and a category score is exactly the average of its readings; the script stops if they don't rebuild the published scores. `run_scoring_pipeline.sh --score` runs it before `package_scout`, which embeds it as `d-metrics_<position>`. The `scout-refresh` Railway job deployed that commit on 18 Nov, so the first published page carrying metrics is the Sunday 22 Nov refresh. No data-scoring change is needed; the platform reads those blobs (Part 2).

## Part 2: platform backend

2.1 `data_scores.py`:
  - Parse `catCh` and the `d-metrics_<position>` blob when present. Store them as fixed-width float32 columns (`array("f")`, padded to 5 categories × 3 metrics, NaN for missing). That keeps memory near +28 MB (about 44 float32 columns × 160k rows) rather than per-row lists.
  - Keep the existing rule: read only positions listed in `d-meta` (this format change broke the reader once before, PR #61).
  - **Tolerate old pages.** If `mCh` is missing, return categories with `metrics: null`, and the UI shows categories only. This lets the platform deploy before the Sunday publish.
  - Add `technical_for_player(impect_id)`, which returns every season × position row with `categories: [{key, label, ch, ch_band, own_pct, metrics: [{key, label, unit, value, pct}]}]`, plus `fit` and `profiles`. The headline row is chosen with `_headline_order`, as today.

2.2 New endpoint `GET /players/{id}/technical-data`:
  - It uses the same role gate as `/data-scores` (`ROLE_ADMIN`, `ROLE_SENIOR_MANAGER`; everyone else gets 403). The gate lives in the backend, not just in the hidden tab, because of the earlier scout-score leak (PR #54).
  - Agents stay denied by default. Check the agent allowlist in `main.py` and don't add this endpoint to it.
  - Internal players and missing ids return `available: false` with a message, mirroring `/data-scores`.
  - Use `@offload_read`.

2.3 Tests in `backend/tests/test_data_scores.py`, using a small fixture page with and without the metric columns:
  - parse old and new formats
  - category padding for 4 vs 5 categories
  - headline selection
  - 403 for the scout, manager and loan manager roles.

## Part 3: platform frontend

3.1 In `PlayerProfilePage.tsx`, restore the `profile-section-tabs` switcher from 5f48901:
  - Show it only when `canAccessScoutApp`. Everyone else sees today's page unchanged.
  - Support `?tab=technical`.
  - Lazy-load the section with `React.lazy`, with the fetch inside the section, so the Profile tab makes no extra requests.

3.2 New `components/player/TechnicalDataSection.tsx` + `.css`:
  - **Controls:** a season · position picker (all scored rows, headline first). No scale switch.
  - **Chart:** a category radar for the selected season.
    - Wedge colour = band colour from `colorUtils.DATA_SCORE_BANDS`, light and dark.
    - A Chart.js `Radar` (not `PolarArea`) on a fixed Championship scale, so shapes compare across players and seasons.
    - A dashed benchmark ring at 100, drawn by a small plugin.
    - Clicking a wedge selects that category.
  - **Metric bars:** a Chart.js bar chart (or plain SVG), one bar per metric grouped by category, with a category heading and score over each group. Bars diverge from 100 with the score printed on each. Move the band colour logic into `colorUtils` so the header box and the tab share it.
  - **Season context line:** position, season, club and league, minutes, plus a small-sample note under 900 minutes.

3.3 States:
  - loading (shimmer in the chart's shape)
  - no data or internal player (the message from the API)
  - goalkeeper (N/A, paused pending review)
  - old-format page (categories only, with "Metric detail arrives with the next weekly refresh")
  - error with retry.

3.4 Tests in `TechnicalDataSection.test.tsx`:
  - renders 4 and 5 categories
  - the season picker changes the values
  - the drill-down opens
  - the categories-only fallback
  - the tab is hidden for a non-scout-app role.

## Rollout

1. Platform PR into `cutover/full`: Parts 2–3, tolerant of old pages, so the tab shows categories straight away.
2. data-scoring PR: Part 1. The metric detail appears after the next Sunday publish.
3. Vercel doesn't promote `cutover/full` automatically: redeploy the preview to production. The Railway backend service is `dependable-adventure`.

## Verification

- Backend: `pytest backend/tests/test_data_scores.py`. Also run once against the live bucket locally with `DATA_SCORES_FILE` pointed at a freshly packaged page.
- Frontend: `npm test -- TechnicalDataSection`. Then a browser check on a striker (4 categories), a centre-back (5), a goalkeeper, a sub-900-minute season and an internal player, in light and dark.
- Roles: admin and senior manager see the tab. Manager, scout, loan manager and intel reviewer see no tab and get 403 from the endpoint.
- Network: opening a profile on the Profile tab makes no `/technical-data` request.
