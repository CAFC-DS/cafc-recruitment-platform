# Agent Intel Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Agent Recommendation card/modal's dark-mode contrast bugs, make it visually consistent with the rest of the site, and make scores and scouting-type icons bigger and more legible everywhere they appear.

**Architecture:** Pure frontend (React/TypeScript + CSS) change, no backend or data-model impact. Two independent fix categories: (1) CSS/JSX theming fixes to the Agent Recommendation card and modal, and (2) sizing bumps to two existing, already-theme-safe components (`GradeChip`, the scouting-type badge) that are simply used too small today. All theming work reuses variables and patterns already established in `ThemeContext.tsx` and `professional-theme.css` — no new design tokens, no new dependencies.

**Tech Stack:** React 18 + TypeScript, react-bootstrap, `professional-theme.css` (global stylesheet), `--color-*` CSS custom properties set by `ThemeContext.tsx`, lucide-react + @tabler/icons-react (already installed, no new icon library).

## Global Constraints

- No backend changes. This plan touches frontend files only.
- Every `--color-*` CSS custom property (`--color-text`, `--color-surface`, `--color-border`, `--color-text-muted`, `--color-primary`, etc.) is set directly on `document.documentElement` by `ThemeContext.tsx` on every theme toggle — these are globally reactive at all times, not scoped to `[data-bs-theme="dark"]`. Only *hardcoded literal colors* (hex/rgb values written directly in CSS) need a `[data-bs-theme="dark"]` override block; anything already using `var(--color-*)` is already theme-safe.
- Follow the codebase's established dark-mode convention: never edit an existing light-mode CSS rule in `professional-theme.css` to "fix" dark mode — add a new, additive `[data-bs-theme="dark"] .some-class { ... }` block below it instead (see the `.agent-portal-*` and `.external-recommendations-*` blocks for the precedent, and the comment directly above them). This keeps light mode provably untouched.
- No new icon library and no icon swap on the scouting-type badge — `Laptop` (lucide-react) stays for "video", `IconBuildingStadium` (@tabler/icons-react) stays for "live". Only their size and the badge's background change.
- `GradeChip`/`GradeChip.css` are not modified — the `size="lg"` variant already exists and is already theme-safe (uses `var(--font-mono)`, backgroundColor/color computed per-score via `getPerformanceScoreColor`/`getContrastTextColor`, not hardcoded). Every call site outside `StyleTilePage.tsx` (the internal design-token demo page, intentionally excluded) changes from `size="sm"`/`"md"` to `size="lg"`.
- No automated test suite covers this UI (confirmed: only `src/App.test.tsx`, a generic CRA smoke test, exists). Verification per task is `npm run lint` (fast, catches TS/JSX errors) plus a final `npm run build` and a manual visual check in the running app in both light and dark mode.
- Spec: `docs/superpowers/specs/2026-07-27-agent-intel-card-redesign-design.md`.

---

### Task 1: Dark-mode theming for `.agent-rec-card`

**Files:**
- Modify: `frontend/src/styles/professional-theme.css` (append after line 3550, immediately before the existing `[data-bs-theme="dark"] .intel-row--agent` block that starts at line 3548)

**Interfaces:**
- Consumes: nothing (pure CSS, no new selectors invented — targets classes already rendered by `PlayerProfilePage.tsx`'s `.agent-rec-card` markup).
- Produces: nothing consumed by later tasks — this task is self-contained.

The `.agent-rec-card` family (lines 3378-3546 of `professional-theme.css`) hardcodes light-mode colors in several places instead of using the already-globally-reactive `--color-*` custom properties:
- `.agent-rec-card` — `background: #ffffff` (line 3381)
- `.agent-rec-card-name` — `color: #111827` (line 3442)
- `.agent-rec-card-agency` — `color: #64748b` (line 3451)
- `.agent-rec-card-chip--deal` / `.agent-rec-card-chip--position` — `background: #f1f5f9; border: 1px solid #e2e8f0; color: #1e293b;` (lines 3475-3485)
- `.agent-rec-card-meta` — `border-top: 1px solid #eef2f7; border-bottom: 1px solid #eef2f7;` (line 3493-3494)
- `.agent-rec-card-meta dt` — `color: #64748b` (line 3510)
- `.agent-rec-card-meta dd` — `color: #111827` (line 3517)

(`.agent-rec-card-strip`, `.agent-rec-card-eyebrow`, `.agent-rec-card-eyebrow-divider`, and `.agent-rec-card-view-btn` already use `var(--color-*, ...)` and need no changes — they're already theme-safe.)

- [ ] **Step 1: Add the additive dark-mode override block**

Open `frontend/src/styles/professional-theme.css`. Find this exact text (currently at line 3547-3550):

```css
[data-bs-theme="dark"] .intel-row--agent > td:first-child {
  border-left-color: #64748b;
}
```

Insert the following new block **immediately before** it (i.e. directly after the `.agent-rec-card-view-btn:hover` rule that ends at line 3546, and before the blank line + comment that precedes `.intel-row--agent`):

```css
/* Dark-mode overrides for .agent-rec-card (Intel History agent recommendation
   card) -- additive only, light-mode rules above are untouched. */
[data-bs-theme="dark"] .agent-rec-card {
  background: var(--color-surface);
  border-color: var(--color-border);
}

[data-bs-theme="dark"] .agent-rec-card-name {
  color: var(--color-text);
}

[data-bs-theme="dark"] .agent-rec-card-agency {
  color: var(--color-text-muted);
}

[data-bs-theme="dark"] .agent-rec-card-chip--deal,
[data-bs-theme="dark"] .agent-rec-card-chip--position {
  background: var(--color-background);
  border-color: var(--color-border);
  color: var(--color-text);
}

[data-bs-theme="dark"] .agent-rec-card-meta {
  border-top-color: var(--color-border);
  border-bottom-color: var(--color-border);
}

[data-bs-theme="dark"] .agent-rec-card-meta dt {
  color: var(--color-text-muted);
}

[data-bs-theme="dark"] .agent-rec-card-meta dd {
  color: var(--color-text);
}

```

- [ ] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: no new errors (CSS isn't linted by this command, but this catches any accidental JSX/TS breakage from your editor if you touched the wrong file — this step should simply pass with the same results as before this task, since no `.tsx`/`.ts` file changed).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/professional-theme.css
git commit -m "Fix agent-rec-card dark mode: use theme vars instead of hardcoded colors"
```

---

### Task 2: Fix `AgentRecommendationModal.tsx` headers and the note-history button

**Files:**
- Modify: `frontend/src/components/AgentRecommendationModal.tsx:126,156,186,211,225-234`
- Modify: `frontend/src/styles/professional-theme.css:139-149` (delete `.agent-rec-fixed-light-btn` rules)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks.

Five `Card.Header`s in this modal use Bootstrap's `bg-light text-dark`, which `ThemeContext.tsx` repoints to dark colors in dark mode (`--bs-light` → dark surface, `--bs-dark`/`.text-dark` → near-black), making the header text and the "View Note History" button unreadable. Replace `bg-light text-dark` with inline styles driven by the theme vars (matching how `IntelModal.tsx`'s `Modal.Header` already handles the analogous case — vars instead of Bootstrap contextual classes), and delete the now-unnecessary `.agent-rec-fixed-light-btn` fixed-color patch since the header itself is now theme-reactive.

- [ ] **Step 1: Replace the four `bg-light text-dark` Card.Header instances**

In `frontend/src/components/AgentRecommendationModal.tsx`, there are four occurrences of this exact line:

```tsx
          <Card.Header className="bg-light text-dark">
```

Replace **all four** occurrences with:

```tsx
          <Card.Header style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text)" }}>
```

(These are the headers for "Deal Information" at line 126, "Wages" at line 156, "Contract" at line 186, and "Additional Information" at line 211.)

- [ ] **Step 2: Replace the fifth Card.Header (the one with the note-history button) and simplify the button**

Find this exact block (currently lines 224-235):

```tsx
        <Card>
          <Card.Header className="bg-light text-dark d-flex justify-content-between align-items-center">
            <h6 className="mb-0">Internal Notes Shared With Agent</h6>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setShowNotesHistory(true)}
              className="agent-rec-fixed-light-btn"
            >
              View Note History
            </Button>
          </Card.Header>
```

Replace it with:

```tsx
        <Card>
          <Card.Header
            className="d-flex justify-content-between align-items-center"
            style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text)" }}
          >
            <h6 className="mb-0">Internal Notes Shared With Agent</h6>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setShowNotesHistory(true)}
            >
              View Note History
            </Button>
          </Card.Header>
```

- [ ] **Step 3: Delete the now-dead `.agent-rec-fixed-light-btn` CSS**

In `frontend/src/styles/professional-theme.css`, find and delete this exact block (currently lines 133-149, including the explanatory comment above it — it no longer applies now that the header it was compensating for is theme-reactive):

```css
/* For buttons inside a header intentionally locked to bg-light/text-dark
   (e.g. AgentRecommendationModal's card headers), regardless of theme.
   ThemeContext repoints --bs-secondary to the dark surface color in dark
   mode, so .btn-outline-secondary's default color/border resolve to
   near-invisible against a light header - !important is required here
   since that reassignment otherwise wins over a plain inline style. */
.agent-rec-fixed-light-btn.btn-outline-secondary {
  color: #374151 !important;
  border-color: #adb5bd !important;
  background-color: transparent !important;
}

.agent-rec-fixed-light-btn.btn-outline-secondary:hover {
  color: #111827 !important;
  border-color: #6c757d !important;
  background-color: #e9ecef !important;
}

```

- [ ] **Step 4: Confirm no other references to the deleted class remain**

Run: `cd frontend && grep -rn "agent-rec-fixed-light-btn" src`
Expected: no output (all references removed in Steps 1-3).

- [ ] **Step 5: Lint**

Run: `cd frontend && npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AgentRecommendationModal.tsx frontend/src/styles/professional-theme.css
git commit -m "Fix AgentRecommendationModal dark mode: theme-reactive headers, remove dead button patch"
```

---

### Task 3: Bump `GradeChip` to `size="lg"` at every production call site

**Files:**
- Modify: `frontend/src/pages/PlayerProfilePage.tsx:1730,2244,2334,2548`
- Modify: `frontend/src/pages/ScoutingPage.tsx:1220,1447`
- Modify: `frontend/src/pages/HomePage.tsx:464`
- Modify: `frontend/src/pages/PlayerListsPage.tsx:1821`

**Interfaces:**
- Consumes: `GradeChip`'s existing `size` prop (`"sm" | "md" | "lg"`, from `frontend/src/components/GradeChip.tsx`) — no changes to that component.
- Produces: nothing consumed by later tasks.

Every `GradeChip` usage in production code (i.e. everywhere except `StyleTilePage.tsx`, which intentionally demos all three sizes side by side and must NOT be touched) changes its `size` prop to `"lg"`.

- [ ] **Step 1: `PlayerProfilePage.tsx` — profile header average score**

Find (currently line 1730):

```tsx
                              <GradeChip score={avgScore} decimals={1} size="md" />
```

Replace with:

```tsx
                              <GradeChip score={avgScore} decimals={1} size="lg" />
```

- [ ] **Step 2: `PlayerProfilePage.tsx` — inline "Latest Score" summary stat**

Find this exact block (currently lines 2239-2248):

```tsx
                    {scoutReportsData.reports[0].overall_rating && (
                      <span className="summary-stat">
                        Latest Score:
                        <GradeChip
                          score={scoutReportsData.reports[0].overall_rating}
                          size="sm"
                          className="ms-1"
                        />
                      </span>
                    )}
```

Replace `size="sm"` with `size="lg"` (leave everything else identical):

```tsx
                    {scoutReportsData.reports[0].overall_rating && (
                      <span className="summary-stat">
                        Latest Score:
                        <GradeChip
                          score={scoutReportsData.reports[0].overall_rating}
                          size="lg"
                          className="ms-1"
                        />
                      </span>
                    )}
```

- [ ] **Step 3: `PlayerProfilePage.tsx` — Scouting History table view score cell**

Find this exact block (currently lines 2328-2338, inside the `<tbody>` of the Scouting History table):

```tsx
                          <td>
                            <div className="d-flex align-items-center justify-content-center gap-1">
                              {report.overall_rating && (
                                <GradeChip
                                  score={report.overall_rating}
                                  isPotential={!!report.is_potential}
                                  size="sm"
                                />
                              )}
                            </div>
                          </td>
```

Replace `size="sm"` with `size="lg"`:

```tsx
                          <td>
                            <div className="d-flex align-items-center justify-content-center gap-1">
                              {report.overall_rating && (
                                <GradeChip
                                  score={report.overall_rating}
                                  isPotential={!!report.is_potential}
                                  size="lg"
                                />
                              )}
                            </div>
                          </td>
```

- [ ] **Step 4: `PlayerProfilePage.tsx` — Scouting History cards view score**

Find this exact block (currently lines 2541-2552):

```tsx
                              ) : (
                                report.overall_rating && (
                                  <>
                                    <small className="text-muted fw-semibold d-block">Score</small>
                                    <GradeChip
                                      score={report.overall_rating}
                                      isPotential={!!report.is_potential}
                                      size="sm"
                                    />
                                  </>
                                )
                              )}
```

Replace `size="sm"` with `size="lg"`:

```tsx
                              ) : (
                                report.overall_rating && (
                                  <>
                                    <small className="text-muted fw-semibold d-block">Score</small>
                                    <GradeChip
                                      score={report.overall_rating}
                                      isPotential={!!report.is_potential}
                                      size="lg"
                                    />
                                  </>
                                )
                              )}
```

- [ ] **Step 5: `ScoutingPage.tsx` — table view score cell**

Find this exact block (currently lines 1214-1224):

```tsx
                      <td>
                        <div className="d-flex align-items-center justify-content-center gap-1">
                          {report.performance_score && (
                            <GradeChip
                              score={report.performance_score}
                              isPotential={!!report.is_potential}
                              size="sm"
                            />
                          )}
                        </div>
                      </td>
```

Replace `size="sm"` with `size="lg"`:

```tsx
                      <td>
                        <div className="d-flex align-items-center justify-content-center gap-1">
                          {report.performance_score && (
                            <GradeChip
                              score={report.performance_score}
                              isPotential={!!report.is_potential}
                              size="lg"
                            />
                          )}
                        </div>
                      </td>
```

- [ ] **Step 6: `ScoutingPage.tsx` — cards view score**

Find this exact block (currently lines 1438-1451):

```tsx
                              report.performance_score && (
                                <>
                                  <small className="text-muted fw-semibold d-block">
                                    Score
                                  </small>
                                  <GradeChip
                                    score={report.performance_score}
                                    isPotential={!!report.is_potential}
                                    size="sm"
                                  />
                                </>
                              )
```

Replace `size="sm"` with `size="lg"`:

```tsx
                              report.performance_score && (
                                <>
                                  <small className="text-muted fw-semibold d-block">
                                    Score
                                  </small>
                                  <GradeChip
                                    score={report.performance_score}
                                    isPotential={!!report.is_potential}
                                    size="lg"
                                  />
                                </>
                              )
```

- [ ] **Step 7: `HomePage.tsx` — recent-reports feed score**

Find this exact block (currently lines 460-465):

```tsx
                          <div className="mb-1 d-flex align-items-center justify-content-end gap-1">
                            <GradeChip
                              score={report.performance_score}
                              isPotential={!!report.is_potential}
                              size="sm"
                            />
```

Replace `size="sm"` with `size="lg"`:

```tsx
                          <div className="mb-1 d-flex align-items-center justify-content-end gap-1">
                            <GradeChip
                              score={report.performance_score}
                              isPotential={!!report.is_potential}
                              size="lg"
                            />
```

- [ ] **Step 8: `PlayerListsPage.tsx` — players table average-score cell**

Find (currently line 1821):

```tsx
                              {player.avg_performance_score !== null ? (
                                <GradeChip score={player.avg_performance_score} decimals={1} size="sm" />
```

Replace with:

```tsx
                              {player.avg_performance_score !== null ? (
                                <GradeChip score={player.avg_performance_score} decimals={1} size="lg" />
```

- [ ] **Step 9: Confirm `StyleTilePage.tsx` was not touched**

Run: `cd frontend && git diff --stat src/pages/StyleTilePage.tsx`
Expected: no output (file untouched).

- [ ] **Step 10: Confirm no stray `size="sm"`/`size="md"` GradeChip usages remain outside StyleTilePage**

Run: `cd frontend && grep -rn 'GradeChip' src/pages | grep -v StyleTilePage`
Expected: every `GradeChip` line shown either has no `size` prop change needed on this line (multi-line JSX — check the following lines manually) or shows `size="lg"`. Cross-check against the 8 call sites fixed above.

- [ ] **Step 11: Lint**

Run: `cd frontend && npm run lint`
Expected: no new errors.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/pages/PlayerProfilePage.tsx frontend/src/pages/ScoutingPage.tsx frontend/src/pages/HomePage.tsx frontend/src/pages/PlayerListsPage.tsx
git commit -m "Bump GradeChip to size=lg at every production call site"
```

---

### Task 4: Bigger scouting-type icons with a tinted background

**Files:**
- Modify: `frontend/src/pages/PlayerProfilePage.tsx:159-174` (the `getScoutingTypeBadge` function)
- Modify: `frontend/src/styles/professional-theme.css` (add new rules after the `.badge-neutral-grey` block, currently ending at line 993)

**Interfaces:**
- Consumes: `IconBuildingStadium` (from `@tabler/icons-react`, already imported) and `Laptop` (from `lucide-react`, already imported) in `PlayerProfilePage.tsx` — no new imports.
- Produces: nothing consumed by later tasks.

Keep both icons as-is (no swap). Increase their size from 14/16px to 20px, and replace the plain `badge badge-neutral-grey` wrapper with a dedicated circular, tinted badge so Video and Live read as visually distinct at a glance, in both themes.

- [ ] **Step 1: Update `getScoutingTypeBadge`**

Find this exact function (currently lines 159-174 of `frontend/src/pages/PlayerProfilePage.tsx`):

```tsx
const getScoutingTypeBadge = (scoutingType: string) => {
  const isLive = scoutingType.toLowerCase() === "live";
  return (
    <span
      className="badge badge-neutral-grey"
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}
      title={`Scouting Type: ${scoutingType}`}
    >
      {isLive ? (
        <IconBuildingStadium size={16} stroke={1.75} aria-label="Live" />
      ) : (
        <Laptop size={14} aria-label="Video" />
      )}
    </span>
  );
};
```

Replace it with:

```tsx
const getScoutingTypeBadge = (scoutingType: string) => {
  const isLive = scoutingType.toLowerCase() === "live";
  return (
    <span
      className={`scouting-type-badge ${isLive ? "scouting-type-badge--live" : "scouting-type-badge--video"}`}
      title={`Scouting Type: ${scoutingType}`}
    >
      {isLive ? (
        <IconBuildingStadium size={20} stroke={1.75} aria-label="Live" />
      ) : (
        <Laptop size={20} aria-label="Video" />
      )}
    </span>
  );
};
```

- [ ] **Step 2: Add the badge CSS**

In `frontend/src/styles/professional-theme.css`, find the end of the `.badge-neutral-grey` block (currently lines 987-993):

```css
/* Neutral grey badge for all type badges (report types, scouting types, etc.) */
.badge-neutral-grey {
  background-color: transparent !important;
  color: var(--color-text, #374151) !important;
  border: none;
  font-weight: 500;
}
```

Insert the following new block **immediately after** it (before the `/* Position text styling ... */` comment that follows):

```css

/* Scouting-type badge (Video/Live) on Scouting History report cards --
   circular, tinted so the two types read as visually distinct at a glance.
   Icon choice is unchanged (Laptop / IconBuildingStadium); this only
   changes size and background. */
.scouting-type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
}

.scouting-type-badge--video {
  background: rgba(100, 116, 139, 0.12);
  color: #475569;
}

.scouting-type-badge--live {
  background: rgba(185, 28, 28, 0.10);
  color: #b91c1c;
}

[data-bs-theme="dark"] .scouting-type-badge--video {
  background: rgba(154, 161, 171, 0.18);
  color: #d1d5db;
}

[data-bs-theme="dark"] .scouting-type-badge--live {
  background: rgba(239, 68, 68, 0.18);
  color: #ef4444;
}
```

- [ ] **Step 3: Lint**

Run: `cd frontend && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/PlayerProfilePage.tsx frontend/src/styles/professional-theme.css
git commit -m "Make scouting-type badges bigger with a tinted circular background"
```

---

### Task 5: Full build and manual verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Production build**

Run: `cd frontend && npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 2: Start the dev server and check the Agent Recommendation card + modal in both themes**

Use the `run` skill (or `cd frontend && npm start`) to launch the app. Navigate to a player profile with at least one agent recommendation in Intel History.

Light mode:
- Confirm the `.agent-rec-card` still looks the way it did before this plan (light card, unchanged layout).
- Open the card's modal ("View details"). Confirm all headers and the "View Note History" button are legible (this was already fine in light mode, should remain so).

Toggle dark mode (site's dark-mode control):
- Confirm the `.agent-rec-card` now renders with a dark surface background and legible text/chips/meta values, instead of a stark white box.
- Open the modal. Confirm every `Card.Header` ("Submission Overview" stays black/white as before; "Deal Information", "Wages", "Contract", "Additional Information", "Internal Notes Shared With Agent") is legible, and specifically confirm the **"View Note History" button is now clearly visible** against its header.

- [ ] **Step 3: Check GradeChip size in both themes across all 7 locations**

In both light and dark mode, visually confirm the score chip is now visibly larger than before at:
- Scouting page: table view and card view score column
- Player profile: Scouting History table view and card view score column, the inline "Latest Score" summary stat, and the "Average Performance Score" profile-header field
- Homepage: recent-reports feed score
- Player Lists page: players table average-score column

Pay particular attention to the Player Lists table and homepage feed — these are denser layouts than the report cards, so confirm the larger chip doesn't cause row-height/overflow problems. If it looks cramped in either spot, note it for a follow-up rather than silently reverting just that one call site.

- [ ] **Step 4: Check scouting-type icons in both themes**

On the player profile's Scouting History cards (or table), confirm the Video and Live badges are visibly bigger, circular, tinted, and clearly distinguishable from each other, in both light and dark mode.

- [ ] **Step 5: Final confirmation**

If everything in Steps 2-4 checks out, the implementation is complete. No commit needed for this task (verification only) — if any issue is found, fix it in the relevant file, re-run `npm run lint`, and commit the fix with a clear message before re-verifying.
