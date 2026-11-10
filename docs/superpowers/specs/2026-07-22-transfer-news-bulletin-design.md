# Transfer News Bulletin — Design

## Context

A new table, `RECRUITMENT_TEST.PUBLIC.SQUAD_CHANGE_LOG`, tracks when a player moves from one squad
to another. Columns: `PLAYERID`, `PLAYERNAME`, `OLD_SQUADNAME`, `NEW_SQUADNAME`, `DETECTED_AT`,
`SEASON`, `COMPETITIONNAME`. It lives in a separate Snowflake database from the app's usual
`CAFC_DB` — confirmed reachable via a fully-qualified table reference from the app's existing
connection (`database=CAFC_DB`), no separate connection/credentials needed. The table is currently
empty (0 rows) — brand new, not yet populated by whatever process feeds it.

The user wants a homepage "news bulletin" / "transfer news" panel surfacing these squad changes,
so staff see at a glance which recommended/tracked players have moved clubs.

## Decisions confirmed with the user

- **Window**: last 7 days by `DETECTED_AT`, not a fixed row count.
- **Visibility**: same audience as the rest of the homepage — every role that sees `HomePage.tsx`
  today (i.e. not Agent or Intel Reviewer, who are already excluded from the homepage route via
  `HomePageWrapper` in `App.tsx`). No new role gating needed.
- **Placement**: a full-width panel **above** the existing 3-column dashboard grid (Recent Scout
  Reports / Recent Flag Reports / Highest Attribute Scores) — reads first, like a real bulletin.
- **Style**: a dedicated, visually distinct "Transfer News" panel (not folded into the existing
  card grid as a 4th tile) — a scrollable list of rows, each reading `Player Name moved from
  Old Squad → New Squad`, a relative timestamp, and the competition/season as a small tag.
  Built from the same list-row/typography patterns already used elsewhere on the homepage so it
  matches the design system, not a one-off visual style.

## Scope

**Backend** — one new endpoint, following the same per-widget-endpoint pattern `HomePage.tsx`
already uses for its other panels (separate calls for scout reports, flag reports, top attributes,
each hitting its own dedicated route):

- `GET /squad-changes/recent` — no query params needed for v1 (window is fixed server-side at 7
  days, per the confirmed scope). Returns:
  ```json
  {
    "changes": [
      {
        "player_name": "...",
        "old_squad": "...",
        "new_squad": "...",
        "detected_at": "2026-07-20T09:00:00",
        "season": "...",
        "competition": "..."
      }
    ]
  }
  ```
  Query: `SELECT PLAYERNAME, OLD_SQUADNAME, NEW_SQUADNAME, DETECTED_AT, SEASON, COMPETITIONNAME
  FROM RECRUITMENT_TEST.PUBLIC.SQUAD_CHANGE_LOG WHERE DETECTED_AT >=
  DATEADD(day, -7, CURRENT_TIMESTAMP()) ORDER BY DETECTED_AT DESC`. No pagination in v1 (7-day
  window is expected to be small; add a LIMIT/offset later only if real usage shows it's needed —
  YAGNI for now).
  Auth: same dependency used by the other homepage-facing endpoints (any authenticated user;
  no `recs_viewer`-style restriction, since this isn't sensitive recommendation data).

**Frontend**:
- New component `frontend/src/components/TransferNewsBulletin.tsx` (+ co-located CSS or reusing
  `professional-theme.css` classes, dark-mode-aware from the start since the whole app just went
  through the design-system-refresh).
- Rendered in `HomePage.tsx` above the existing `<Row className="g-4">` 3-column grid.
- Fetched in the existing `fetchDashboardData()` function alongside the other panel fetches (same
  pattern, same error-isolation — a failure here must not break the rest of the dashboard, matching
  how e.g. `database/metadata` is already wrapped in its own try/catch so one panel's failure
  doesn't take down the page).
- **Empty state**: "No squad changes in the last 7 days." (table is empty right now, so this is
  the state every reviewer will actually see until the table gets populated — must look
  intentional, not broken).
- No player-profile linking in v1 (the log's `PLAYERID` could in principle be cross-referenced to
  our `players` table, but that adds real complexity — matching logic, handling unmatched players —
  for a "nice to have." Plain text rows only for now; can revisit if requested later).

## Out of scope

- Populating `SQUAD_CHANGE_LOG` itself — that's a separate, already-existing process the user owns.
- Filtering/search UI for the bulletin (it's a lightweight glance-and-go panel, not a full page).
- Any change to `colorUtils.ts`, stage colors, or other frozen semantic-color files — this feature
  doesn't touch grade/flag/stage color logic at all.

## Verification

- `tsc --noEmit`, `eslint` (same bar as the rest of this codebase's recent work).
- Live check: confirm the panel renders correctly with an empty table (its current real state),
  and confirm the query/endpoint work end-to-end once test rows exist (can insert a couple of
  test rows directly to confirm rendering, then decide with the user whether to leave or remove
  them).
- Both light and dark mode.
