# DB Optimisation Investigation

## Summary

This branch reviews three optimisation themes against the current codebase:

1. Query analysis and profiling
2. Caching
3. Window functions

The main takeaway is that **all three can help**, but they should be applied in a sensible order:

1. add lightweight query profiling first
2. tighten caching around the highest-read endpoints
3. use window functions selectively to simplify repeated ranking/latest-row logic and reduce duplicate scans

The current backend is very capable functionally, but most database access still lives in one large file, and many endpoints build bespoke Snowflake SQL directly in [backend/main.py](backend/main.py). That means performance issues are possible, but they are hard to measure consistently today.

## What Exists Today

### 1. Query analysis and profiling

There is **no real query profiling layer** in the app right now.

What I found:

- Snowflake connections are created centrally in [backend/main.py](backend/main.py:708)
- There is no use of `EXPLAIN`, `QUERY_HISTORY`, query ids, or structured query timing logging in the app
- There is no shared wrapper around `cursor.execute(...)` that records duration, row count, endpoint name, or the Snowflake query id

Practical impact:

- when a page is slow, we have to guess which query is causing it
- there is no easy way to compare before/after improvements
- we cannot identify the worst 10 queries from production traffic without external Snowflake inspection

### 2. Caching

There is already a simple in-memory cache:

- cache helpers live in [backend/main.py](backend/main.py:565)
- cache invalidation helpers live in [backend/main.py](backend/main.py:590)

This is helpful, but limited:

- it is **process-local only**
- it is **manual and endpoint-specific**
- it does not survive restart/redeploy
- it is not ideal if you ever run multiple app instances

Current cached examples:

- scout report timeline analytics in [backend/main.py](backend/main.py:3742)
- recent reports in [backend/main.py](backend/main.py:7692)
- player profile in [backend/main.py](backend/main.py:9016)
- player lists summary in [backend/main.py](backend/main.py:13468)
- analytics endpoints around player/match/scout views in [backend/main.py](backend/main.py:11568), [backend/main.py](backend/main.py:11799), [backend/main.py](backend/main.py:12185), [backend/main.py](backend/main.py:12500), [backend/main.py](backend/main.py:12660)

### 3. Window functions

I did **not** find much current use of SQL window functions in the main backend query layer.

That is not automatically bad, but it does mean:

- some “latest”, “top”, “dedupe”, or “progression” style logic is likely being handled through repeated grouped queries, ordering, or Python-side shaping
- there are probably opportunities to reduce query count and simplify logic using `ROW_NUMBER()`, `RANK()`, `LAG()`, `LEAD()`, and partitioned aggregates

## Biggest Opportunities

## A. Query Analysis & Profiling

### Why it would help here

This codebase has several heavy read endpoints that are likely worth profiling first:

- internal recommendation shortlist in [backend/main.py](backend/main.py:3330)
- scout report list endpoints in [backend/main.py](backend/main.py:7430) and [backend/main.py](backend/main.py:7692)
- player lists summary in [backend/main.py](backend/main.py:13468)
- all lists with details in [backend/main.py](backend/main.py:13549)
- player analytics in [backend/main.py](backend/main.py:11781)
- match/team analytics in [backend/main.py](backend/main.py:12169)
- scout analytics in [backend/main.py](backend/main.py:12483)

Common pattern I found:

- many endpoints do one query for `COUNT(*)`
- then another query for paginated data
- often both queries rebuild the same heavy joined base SQL

Examples:

- recommendations shortlist in [backend/main.py](backend/main.py:3397)
- scout reports list in [backend/main.py](backend/main.py:7558)
- recent reports in [backend/main.py](backend/main.py:7754)
- intel/report list patterns in [backend/main.py](backend/main.py:10629)

This is not necessarily wrong, but it is exactly the kind of pattern that can become expensive at scale.

### Best first improvement

Add a tiny shared query execution helper that logs:

- endpoint name
- duration in ms
- Snowflake query id
- row count where available
- whether the result came from cache

Suggested v1 approach:

- create a wrapper such as `execute_timed_query(cursor, sql, params, label)`
- after execute, log the elapsed time and `cursor.sfqid`
- add a slow-query threshold, for example `> 500ms` or `> 1000ms`
- optionally expose a temporary admin-only route to inspect recent slow queries in app memory

### Expected benefit

- quickest way to identify true hotspots
- avoids optimising the wrong queries
- gives you evidence for whether caching or SQL refactors matter most

## B. Caching

### Why it would help here

This app has many read-heavy views where data changes less frequently than it is requested:

- homepage recent reports
- analytics tabs
- shortlist overview tables
- filter metadata
- player profile pages
- league/country/team dropdown data

There is already some caching, but it is uneven.

### Highest-value cache targets

#### 1. Recommendation shortlist filter metadata

[backend/main.py](backend/main.py:3429) fetches recommendation filter meta by querying distinct agents each time.

Why cache it:

- small payload
- changes infrequently
- used repeatedly by the same screens

#### 2. Internal recommendations shortlist result sets

[backend/main.py](backend/main.py:3330) is a strong candidate for short-lived caching when filters are identical.

Why it helps:

- heavy read page
- joins and derived expressions
- repeated refreshes from the same users with the same filters

Caution:

- cache keys need to include all filters, page, sort, and role context
- writes must invalidate shortlist-related keys

#### 3. Player list detail payloads

[backend/main.py](backend/main.py:13549) looks like a natural cache candidate for short windows because list/detail pages are read repeatedly.

Why it helps:

- these pages are likely among the heaviest internal reads
- list data is business-critical but not changing every second

#### 4. Analytics tabs

These are already partly cached and are good candidates to keep improving:

- [backend/main.py](backend/main.py:11568)
- [backend/main.py](backend/main.py:11799)
- [backend/main.py](backend/main.py:12185)
- [backend/main.py](backend/main.py:12500)
- [backend/main.py](backend/main.py:12660)

### Main cache limitation to fix later

The current cache is in-process only. If the platform grows, a shared cache such as Redis would be more reliable for:

- multiple instances
- consistent invalidation
- fewer cold starts after deploys

### Expected benefit

- very good payoff for dashboard and analytics pages
- reduces repeated Snowflake load on popular screens
- fast wins without deep SQL rewrites

## C. Window Functions

### Why they would help here

Window functions are most useful here when you need:

- latest row per player/list/report
- ranking within a group
- counts and movement summaries without separate regrouping passes
- progression/sequence logic

### Best candidate areas

#### 1. Latest stage or latest history per player/list

There is a lot of list and stage-history logic around:

- [backend/main.py](backend/main.py:13468)
- [backend/main.py](backend/main.py:13549)
- stage history read/edit logic around the 14500 area

Possible improvement:

- use `ROW_NUMBER() OVER (PARTITION BY list_id, player_id ORDER BY changed_at DESC, id DESC)` to isolate the current/latest stage record cleanly

Benefit:

- clearer logic for “current status” versus “history”
- reduces reliance on Python-side resolution or multiple grouped lookups

#### 2. Recommendation shortlist derived views

The recommendation shortlist uses a derived subquery via [backend/main.py](backend/main.py:2164) and [backend/main.py](backend/main.py:3397).

Possible improvement:

- use window functions if you need latest status event, agent state, or ranked duplicates by player/agent/date
- use `COUNT(*) OVER()` in some cases to avoid a separate `COUNT(*)` query for the same filtered result set

Caution:

- `COUNT(*) OVER()` can be helpful, but only if the total-query cost is actually better than the current separate count in Snowflake
- this is exactly why profiling should come first

#### 3. Scout reports “latest per player” or “top recent per player”

Scout report queries in:

- [backend/main.py](backend/main.py:7430)
- [backend/main.py](backend/main.py:7692)
- [backend/main.py](backend/main.py:9474)

could benefit from window functions if you want:

- latest report per player
- best/latest flag per player
- per-scout ranking or recent-first group selection

#### 4. Stage movement analytics

The new stage-movement analytics endpoint itself is simple and does not need a window function today. But if you later want:

- weekly trend by stage transition
- conversion rates by period
- time-to-progress from stage 1 to stage 2 to stage 3

then `LAG()` / `LEAD()` and partitioning by player/list would become very helpful.

### Expected benefit

- cleaner SQL for progression/ranking problems
- fewer duplicate query passes for “latest row per group” use cases
- stronger foundation for richer analytics later

## Priority Recommendation

## Phase 1: Add profiling first

Do this before trying to optimise everything:

1. add timed query logging around Snowflake execution
2. capture query id and endpoint name
3. log slow queries only
4. review the worst shortlist, report, and analytics queries

This should be the first piece of work.

## Phase 2: Expand caching where reads are hottest

Focus on:

1. shortlist filter metadata
2. internal recommendations table reads
3. player list detail responses
4. analytics result payloads

This is probably the best effort-to-impact ratio after profiling.

## Phase 3: Use window functions selectively

Do not rewrite queries just because window functions are available.

Use them where they clearly help:

1. latest stage/history row per player/list
2. ranked/latest report selection
3. possibly replacing duplicate count/list passes where proven helpful

## Recommended Next Tickets

### Ticket 1: Add Snowflake query timing + query id logging

Scope:

- shared execute helper
- endpoint labels
- slow query threshold
- optional admin debug output

### Ticket 2: Cache internal recommendations shortlist + filter metadata

Scope:

- cache keys based on filters/page/sort
- invalidation on recommendation status updates and submission edits

### Ticket 3: Cache player-lists/all-with-details

Scope:

- short TTL
- invalidate on list mutations and stage changes

### Ticket 4: Review window-function opportunities in list/stage history queries

Scope:

- latest stage per player/list
- progression reporting
- dedupe or rank-based shortlist helpers

## Bottom Line

Yes, all three areas can help this platform.

- **Query analysis and profiling** will help the most immediately because it tells us where the real pain is.
- **Caching** is the fastest practical win for repeated dashboard, shortlist, and analytics reads.
- **Window functions** are likely the right tool for selected shortlist/history/report problems, but they should be introduced surgically, not everywhere.

If you want to move this forward, the best next implementation would be:

1. profiling helper
2. shortlist/list caching improvements
3. targeted window-function refactors after measuring the current hotspots
