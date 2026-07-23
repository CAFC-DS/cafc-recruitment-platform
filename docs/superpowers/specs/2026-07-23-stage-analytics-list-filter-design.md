# Stage Analytics: filter by internal list name

## Context

Stage Analytics (the "Stage Movement" tab on the Analytics dashboard) already filters its numbers by position, but indirectly: the filter dropdown shows 19 fine-grained scouting position codes (RB, RWB, RCB(3), RCB(2), etc.), which the backend then maps down to the actual internal list a player sits on (`player_lists.LIST_NAME`) via a hardcoded `POSITION_TO_LIST_NAME` dictionary. There are only 11 distinct internal lists (GK, RB/RWB, LB/LWB, RCB, LCB, CCB, DM/CM, AM, RW, LW, CF), so several granular codes collapse onto the same list under the hood — e.g. picking "RB" already secretly means "RB/RWB list."

This indirection is confusing: the filter's options don't match what's actually being filtered on. The ask is to make the filter directly show and filter by the real internal list names, so picking "RB/RWB" is exactly the "RB/RWB" list, with no hidden mapping.

**Why:** the recruitment analyst wants Stage Analytics numbers scoped to a specific internal list (e.g. "RB/RWB") and the current position-code filter doesn't make that mapping obvious.

**How to apply:** this is a filter-labeling and param-shape change only — no schema changes, no new tables, no changes to how lists are created or named. The underlying data model (players belong to `player_lists` rows named after positions) is unchanged.

## Current Implementation (reference)

- **Frontend:** `frontend/src/components/analytics/StageMovementAnalyticsTab.tsx` — `selectedPositions` state (line 81), filter rendered via `PositionMultiSelect` (lines 188-193) with `options={POSITION_ORDER}` (the 19-code list from `frontend/src/constants/positions.ts`). Sent to the backend as `positions: selectedPositions.join(",")` (line 96).
- **Reusable widget:** `frontend/src/components/analytics/PositionMultiSelect.tsx` — fully generic (`selected`, `options`, `onChange` props), already used elsewhere with the granular codes in `PlayerAnalyticsTab.tsx` — that usage is untouched by this change.
- **Backend:** `GET /analytics/stage-movements` (`backend/main.py`, ~line 14231). Parses `positions` param → `list_names_for_positions(position_list)` (line 848) maps codes to distinct `LIST_NAME`s via `POSITION_TO_LIST_NAME` (line 834) → builds `TRIM(pl.LIST_NAME) IN (...)` clause. Empty selection = no filter (shows all). Scoped to `pl.LIST_CATEGORY = 'first_team'` throughout.
- `POSITION_TO_LIST_NAME` and `list_names_for_positions()` are also used by a second, unrelated analytics query (~lines 13692-13706) — out of scope for this change, must remain working as-is.

## Plan

### 1. Frontend constant

In `frontend/src/constants/positions.ts`, add:
```ts
// The internal recruitment lists players sit on, named by position group.
// Matches the distinct values of backend POSITION_TO_LIST_NAME.
export const STAGE_ANALYTICS_LIST_NAMES: string[] = [
  "GK", "RB/RWB", "LB/LWB", "RCB", "LCB", "CCB", "DM/CM", "AM", "RW", "LW", "CF",
];
```

### 2. Frontend: StageMovementAnalyticsTab

- Import `STAGE_ANALYTICS_LIST_NAMES` instead of `POSITION_ORDER`.
- Rename `selectedPositions`/`setSelectedPositions` to `selectedLists`/`setSelectedLists` (local state only — no other component references this state).
- Pass `options={STAGE_ANALYTICS_LIST_NAMES}` to `PositionMultiSelect`.
- Change the form label from "Position" to "List".
- Change the request param from `positions: selectedPositions.join(",")` to `lists: selectedLists.join(",")`.

### 3. Backend: GET /analytics/stage-movements

- Derive the valid list-name set from the existing mapping so there's one source of truth: `STAGE_LIST_NAMES = list(dict.fromkeys(POSITION_TO_LIST_NAME.values()))`, defined near `POSITION_TO_LIST_NAME` (~line 845).
- Change the endpoint's query param from `positions: Optional[str] = None` to `lists: Optional[str] = None`.
- Parse into `list_names = [x.strip() for x in lists.split(",") if x.strip()]` (mirrors current `position_list` parsing).
- Validate: any name not in `STAGE_LIST_NAMES` → `HTTPException(400, detail=f"Invalid list name(s): ... Must be one of: {', '.join(STAGE_LIST_NAMES)}")`, consistent with how other enum params are validated in this file (e.g. `STAGE_1_REASONS`).
- Build `position_clause`/`position_params` directly from the validated `list_names` (no more `list_names_for_positions()` call in this endpoint) — same `TRIM(pl.LIST_NAME) IN (...)` SQL as today.
- Update the cache key to use the `lists` value instead of `positions`.
- Empty `lists` param still means no filter (unchanged behavior).
- Leave `POSITION_TO_LIST_NAME`, `list_names_for_positions()`, and `ALLOWED_RECOMMENDED_POSITIONS` untouched — still used by the other analytics query and by scout report position validation.

### 4. Response shape

The response currently echoes back `positions` (the parsed filter) — rename this field to `lists` for consistency. This is a same-session frontend+backend change so there's no compatibility concern with other consumers (grep confirms `StageMovementAnalyticsTab.tsx` is the only caller of this endpoint).

## Verification

- Backend: call `GET /analytics/stage-movements?lists=RB/RWB` and confirm the three result sections (`metrics`, `stage_counts`, `stage_ever_counts`) only reflect players whose current list is `RB/RWB`. Call with an invalid value (e.g. `lists=RB`) and confirm a 400 with a clear message. Call with no `lists` param and confirm results match the unfiltered totals from before this change.
- Frontend: run the app, open Analytics → Stage Movement tab, open the filter dropdown and confirm it shows the 11 list names (not the 19 position codes), select one or two, and confirm the numbers update and match a manual check against the corresponding list(s) on the Lists page.
- Confirm `PlayerAnalyticsTab.tsx`'s separate position filter (still using `POSITION_ORDER`) is unaffected.
