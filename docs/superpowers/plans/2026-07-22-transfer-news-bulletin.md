# Transfer News Bulletin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Transfer News" bulletin panel to the homepage, showing squad changes from
`RECRUITMENT_TEST.PUBLIC.SQUAD_CHANGE_LOG` over the last 7 days, above the existing 3-column
dashboard grid.

**Architecture:** One new backend endpoint (`GET /squad-changes/recent`) following the exact
pattern of the existing homepage-widget endpoints (`/scout_reports/recent`,
`/scout_reports/top-attributes`) — same auth dependency, same cache helper, same
try/except/finally shape. One new frontend component (`TransferNewsBulletin.tsx` +
co-located `.css`) fetched from `HomePage.tsx`'s existing `fetchDashboardData()` alongside its
other panel fetches, rendered above the existing `<Row className="g-4">` 3-column grid.

**Tech Stack:** FastAPI + Snowflake connector (backend, matching `backend/main.py`'s existing
conventions), React + TypeScript + react-bootstrap (frontend, matching `HomePage.tsx`'s existing
conventions). CSS uses `var(--color-*)` custom properties directly (no `[data-bs-theme="dark"]`
duplicate blocks needed) — the same pattern already used in `components/auth/AuthShell.css`.

## Global Constraints

- Work happens on branch `feature/transfer-news-bulletin`, worktree at
  `/Users/hashim.umarji/Desktop/CAFC/2025-26/Recruitment/Coding/NewRecruitmentPlatform-transfer-news`.
- Do not touch `frontend/src/utils/colorUtils.ts`, `frontend/src/styles/playerLists.theme.ts`, or
  any grade/flag/stage color logic — this feature doesn't need them.
- The endpoint must not require any new Snowflake connection/credentials — confirmed the app's
  existing `get_snowflake_connection()` (default `database=CAFC_DB`) can already reach
  `RECRUITMENT_TEST.PUBLIC.SQUAD_CHANGE_LOG` via a fully-qualified table name (verified directly
  against the warehouse before writing this plan).
- `SQUAD_CHANGE_LOG` columns (verified via `DESCRIBE TABLE`): `PLAYERID NUMBER`,
  `PLAYERNAME VARCHAR`, `OLD_SQUADNAME VARCHAR`, `NEW_SQUADNAME VARCHAR`,
  `DETECTED_AT TIMESTAMP_NTZ`, `SEASON VARCHAR`, `COMPETITIONNAME VARCHAR`. The table currently
  has 0 rows — the empty-state path is what every reviewer will actually see until it's populated,
  so it must look intentional.
- No pagination, no query params in v1 (fixed 7-day window server-side) — YAGNI per the design
  spec (`docs/superpowers/specs/2026-07-22-transfer-news-bulletin-design.md`).
- `tsc --noEmit` and `eslint` must stay clean (0 new errors, no new warnings beyond the
  pre-existing baseline) — this codebase has no meaningful automated test suite, so these plus a
  live browser check are the real verification gates.

---

## Task 1: Backend endpoint `GET /squad-changes/recent`

**Files:**
- Modify: `backend/main.py`

**Interfaces:**
- Produces: `GET /squad-changes/recent` → `{"changes": [{"player_name": str, "old_squad": str,
  "new_squad": str, "detected_at": str | None, "season": str | None, "competition": str | None}]}`.
  Consumed by Task 2's frontend fetch.

- [ ] **Step 1: Read the current file around the insertion point to confirm nothing has drifted**

```bash
sed -n '8720,8746p' backend/main.py
```
Expected: this shows the tail of `get_top_attribute_reports` (ending with `finally: if conn:
conn.close()`) immediately followed by `@app.get("/scout_reports/{report_id}")`. If the line
numbers have drifted, search for `@app.get("/scout_reports/{report_id}")` instead and insert
directly above it — the goal is simply "right after the last `/scout_reports/*` dashboard-widget
endpoint, right before the report-detail endpoint", not a specific line number.

- [ ] **Step 2: Insert the new endpoint**

Insert this new endpoint immediately before the `@app.get("/scout_reports/{report_id}")` line
(i.e. right after `get_top_attribute_reports`'s closing `finally` block):

```python
@app.get("/squad-changes/recent")
async def get_recent_squad_changes(
    current_user: User = Depends(get_current_user),
):
    """
    Get squad changes detected in the last 7 days, for the homepage Transfer News
    bulletin. Reads from RECRUITMENT_TEST.PUBLIC.SQUAD_CHANGE_LOG, a separate
    Snowflake database from the app's usual CAFC_DB -- reachable via a fully
    qualified table name on the same connection, no separate credentials needed.
    """
    cache_key = "recent_squad_changes"
    cached_data = get_cache(cache_key)
    if cached_data is not None:
        return cached_data

    conn = None
    try:
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT PLAYERNAME, OLD_SQUADNAME, NEW_SQUADNAME, DETECTED_AT, SEASON, COMPETITIONNAME
            FROM RECRUITMENT_TEST.PUBLIC.SQUAD_CHANGE_LOG
            WHERE DETECTED_AT >= DATEADD(day, -7, CURRENT_TIMESTAMP())
            ORDER BY DETECTED_AT DESC
            """
        )
        changes = [
            {
                "player_name": row[0],
                "old_squad": row[1],
                "new_squad": row[2],
                "detected_at": serialize_datetime(row[3]),
                "season": row[4],
                "competition": row[5],
            }
            for row in cursor.fetchall()
        ]

        result = {"changes": changes}
        set_cache(cache_key, result, expiry_minutes=5)
        return result
    except Exception as e:
        logging.exception(e)
        raise HTTPException(
            status_code=500, detail=f"Error fetching recent squad changes: {e}"
        )
    finally:
        if conn:
            conn.close()
```

- [ ] **Step 3: Verify the backend starts cleanly and the endpoint responds**

Restart the backend dev server (kill any existing `main.py` process first, matching how it's been
run all session):
```bash
cd backend
pkill -f "python main.py" 2>/dev/null; sleep 1
/Users/hashim.umarji/Desktop/CAFC/2025-26/Recruitment/Coding/NewRecruitmentPlatform/backend/venv/bin/python main.py > /tmp/backend-dev.log 2>&1 &
sleep 6
tail -20 /tmp/backend-dev.log
```
Expected: `✅ Startup cache loading complete`, no tracebacks.

```bash
curl -s -X POST http://localhost:8000/token -d "username=<a real dev username>&password=<password>" -H "Content-Type: application/x-www-form-urlencoded"
```
Use the returned `access_token` to call the new endpoint:
```bash
curl -s http://localhost:8000/squad-changes/recent -H "Authorization: Bearer <token>"
```
Expected: `{"changes": []}` (table is currently empty — this is the correct, expected response,
not a bug).

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "Add GET /squad-changes/recent endpoint for homepage Transfer News bulletin"
```

---

## Task 2: Frontend `TransferNewsBulletin` component + `HomePage.tsx` integration

**Files:**
- Create: `frontend/src/components/TransferNewsBulletin.tsx`
- Create: `frontend/src/components/TransferNewsBulletin.css`
- Modify: `frontend/src/pages/HomePage.tsx`

**Interfaces:**
- Consumes: `GET /squad-changes/recent` from Task 1 — `{"changes": [{"player_name": string,
  "old_squad": string, "new_squad": string, "detected_at": string | null, "season": string | null,
  "competition": string | null}]}`.
- Produces: `TransferNewsBulletin` component, default export, no props (fetches its own data
  independently — matches how `HomePage.tsx`'s other panels are structured as self-contained
  fetch-and-render blocks within the same component; a standalone component is used here purely to
  keep `HomePage.tsx` from growing further, not to change the fetch pattern).

- [ ] **Step 1: Create `frontend/src/components/TransferNewsBulletin.css`**

```css
.transfer-news-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  margin-bottom: 1.5rem;
}

.transfer-news-header {
  background: #000000;
  color: #ffffff;
  border-bottom: 2px solid var(--color-primary, #b91c1c);
  padding: 0.85rem 1.25rem;
  border-radius: 12px 12px 0 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

.transfer-news-body {
  max-height: 260px;
  overflow-y: auto;
  padding: 0.5rem 1.25rem;
}

.transfer-news-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--color-border);
}

.transfer-news-row:last-child {
  border-bottom: none;
}

.transfer-news-move {
  color: var(--color-text);
  font-size: 0.92rem;
}

.transfer-news-player {
  font-weight: 700;
}

.transfer-news-squad-old {
  color: var(--color-text-muted);
}

.transfer-news-squad-new {
  color: var(--color-text);
  font-weight: 600;
}

.transfer-news-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.15rem;
  flex-shrink: 0;
}

.transfer-news-time {
  color: var(--color-text-muted);
  font-size: 0.78rem;
  white-space: nowrap;
}

.transfer-news-tag {
  background: var(--color-background);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.1rem 0.55rem;
  font-size: 0.7rem;
  white-space: nowrap;
}

.transfer-news-empty {
  color: var(--color-text-muted);
  text-align: center;
  padding: 1rem 0;
  margin: 0;
}
```

- [ ] **Step 2: Create `frontend/src/components/TransferNewsBulletin.tsx`**

```tsx
import React, { useEffect, useState } from "react";
import { Card, Spinner } from "react-bootstrap";
import { Newspaper } from "lucide-react";
import axiosInstance from "../axiosInstance";
import "./TransferNewsBulletin.css";

interface SquadChange {
  player_name: string;
  old_squad: string;
  new_squad: string;
  detected_at: string | null;
  season: string | null;
  competition: string | null;
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return "";
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

const TransferNewsBulletin: React.FC = () => {
  const [changes, setChanges] = useState<SquadChange[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchChanges = async () => {
      try {
        const response = await axiosInstance.get("/squad-changes/recent");
        if (!cancelled) {
          setChanges(response.data.changes || []);
        }
      } catch (error) {
        console.error("Error fetching squad changes:", error);
        // Non-critical widget -- fail silently, matching the /database/metadata
        // pattern elsewhere in HomePage.tsx, so one panel's failure doesn't
        // affect the rest of the dashboard.
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchChanges();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="transfer-news-card">
      <div className="transfer-news-header">
        <Newspaper size={17} stroke={1.75} />
        Transfer News
      </div>
      <Card.Body className="transfer-news-body">
        {loading ? (
          <div className="text-center py-2">
            <Spinner animation="border" size="sm" />
          </div>
        ) : changes.length === 0 ? (
          <p className="transfer-news-empty">
            No squad changes in the last 7 days.
          </p>
        ) : (
          changes.map((change, index) => (
            <div className="transfer-news-row" key={`${change.player_name}-${change.detected_at}-${index}`}>
              <div className="transfer-news-move">
                <span className="transfer-news-player">{change.player_name}</span>{" "}
                moved from{" "}
                <span className="transfer-news-squad-old">{change.old_squad || "Unknown"}</span>
                {" → "}
                <span className="transfer-news-squad-new">{change.new_squad || "Unknown"}</span>
              </div>
              <div className="transfer-news-meta">
                <span className="transfer-news-time">{formatRelativeTime(change.detected_at)}</span>
                {(change.competition || change.season) && (
                  <span className="transfer-news-tag">
                    {[change.competition, change.season].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </Card.Body>
    </Card>
  );
};

export default TransferNewsBulletin;
```

- [ ] **Step 3: Read the current `HomePage.tsx` insertion point to confirm nothing has drifted**

```bash
grep -n "1x3 Grid Dashboard" frontend/src/pages/HomePage.tsx
```
Expected: one match, a comment `{/* 1x3 Grid Dashboard */}` immediately followed by
`<Row className="g-4">`. If line numbers drifted, insert immediately before this comment — the
goal is "directly above the existing 3-column grid", not a specific line number.

- [ ] **Step 4: Import the component in `HomePage.tsx`**

Find:
```tsx
import GradeChip from "../components/GradeChip";
import GradeLabelChip from "../components/GradeLabelChip";
```
Add immediately after:
```tsx
import TransferNewsBulletin from "../components/TransferNewsBulletin";
```

- [ ] **Step 5: Render the component above the 3-column grid**

Find:
```tsx
        {/* 1x3 Grid Dashboard */}
        <Row className="g-4">
```
Change to:
```tsx
        <TransferNewsBulletin />

        {/* 1x3 Grid Dashboard */}
        <Row className="g-4">
```

- [ ] **Step 6: Verify — `tsc`, `eslint`, frozen-file diff**

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean.

```bash
CI=true npx eslint src --ext .ts,.tsx
```
Expected: 0 errors, same warning count as before this task (no new warnings introduced).

```bash
cd .. && git diff main -- frontend/src/utils/colorUtils.ts frontend/src/styles/playerLists.theme.ts
```
Expected: empty.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/TransferNewsBulletin.tsx frontend/src/components/TransferNewsBulletin.css frontend/src/pages/HomePage.tsx
git commit -m "Add Transfer News bulletin panel to homepage"
```

---

## Task 3: Live verification (both themes, empty and populated states)

**Files:** none modified — verification-only closing task.

- [ ] **Step 1: Confirm dev servers are running**

Backend on `:8000` (restarted in Task 1, Step 3), frontend on `:3001`
(`cd frontend && npm start` if not already running).

- [ ] **Step 2: Verify the empty state renders correctly (the table's actual current state)**

Log in, navigate to the homepage (`/`), confirm:
- "Transfer News" panel appears above the 3-column grid, with a black header (matching the other
  panel headers) and a newspaper icon.
- Body shows "No squad changes in the last 7 days." — not a spinner stuck forever, not a blank
  gap, not an error.
- Check in both light and dark mode (`localStorage.setItem('darkMode', 'true'/'false')` +
  reload) — confirm the panel's card background, border, and empty-state text all read correctly
  in both themes via `getComputedStyle`.

- [ ] **Step 3: Verify the populated state with temporary test data**

Insert 2-3 temporary rows directly into `RECRUITMENT_TEST.PUBLIC.SQUAD_CHANGE_LOG` (via a
throwaway script using the same Snowflake connection approach as
`backend/tools/export_agent_recommendations.py`), covering: a normal row, a row with a null
`COMPETITIONNAME` (confirm the tag simply doesn't render rather than showing "null"), and a row
with `DETECTED_AT` older than 7 days (confirm it's correctly excluded).

Reload the homepage, confirm:
- The in-window rows render with correct player name, old → new squad, relative time, and
  competition tag.
- The out-of-window row does NOT appear.
- Both light and dark mode still read correctly with real content in the rows.

Delete the temporary test rows afterward (`DELETE FROM RECRUITMENT_TEST.PUBLIC.SQUAD_CHANGE_LOG
WHERE PLAYERNAME = '<test marker used>'`) so the table is left in its real (empty) state — don't
leave fake data behind.

- [ ] **Step 4: Report results**

Summarize what was verified live vs. what could only be checked at the code level, following the
same honesty standard used throughout this project's other verification passes — don't claim a
live check that didn't actually happen.
