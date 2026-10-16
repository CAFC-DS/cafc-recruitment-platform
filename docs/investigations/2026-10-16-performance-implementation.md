# Platform loading improvements — 16 October 2026

Branch: `codex/platform-load-performance`.
Base: production `cutover/full` commit `3fcbb6fe1a5db1471378b929f8f8d1bcfd6f71c2`, verified against both Vercel and Railway.

## Implemented

- Offload synchronous database GET handlers and authentication lookup helpers from the ASGI event loop. A shared AnyIO limiter permits up to eight concurrent read jobs per event loop; this is a job limit, not a total database-connection limit. Existing asynchronous interfaces, route signatures, exception behaviour, and fresh database-backed authentication are preserved.
- Leave write handlers' execution model unchanged to avoid introducing concurrent legacy ID allocation and transaction changes into this performance patch. Writes can still block the event loop; isolating those operations safely is further work.
- Protect shared response caches with a lock and prevent an older in-flight read from restoring a cache invalidated by a write. Expired entries are removed when read.
- Remove two diagnostic database round trips from each player search. Reuse existing table schemas for recommendation reads and flow history; deduplicate missing-schema refreshes and back off failed optional-table probes for a minute.
- Share the current-user result through a provider, deduplicating in-flight requests including StrictMode effect replay. Hide the previous account's permissions immediately on a token change, ignore stale responses, clear on logout, and revalidate when returning to the tab or every five minutes while visible. Backend authorization remains fresh on each authenticated request.
- Split pages into lazy chunks; separate authentication from the route module. Add browser `max-age` to content-hashed static assets while preserving HTML revalidation.
- Fetch and render dashboard sections independently, with separate errors and loading states. Preserve cancellation/generation checks when changing filters and remove the homepage's additional user lookup.
- Avoid duplicate position-history requests caused by setting server-selected defaults. Preserve competition selection when resetting the season filter.
- Send backend errors to the hosting log stream as well as the existing local error file, making future production exceptions inspectable.

## Measurements and checks

- Local production-build initial JavaScript: 1,688,086 bytes / 447,150 gzip before; approximately 603,774 bytes / 184,131 gzip after (about **59% less compressed initial JavaScript**). These comparable local builds use the existing installed dependency tree. Actual Vercel output can differ with dependency resolution and build variables. This measures the entrypoint, not all subsequently downloaded route chunks.
- Controlled ASGI benchmark: four concurrent `/users/me` requests with a 150 ms database stub each took **0.624 s before / 0.160 s after**, a 74% reduction. This demonstrates scheduling, not a forecast of real-world page load times.
- Frontend type check and production build pass. Frontend: **23 tests pass**, including shared authentication, account switching/logout, progressive sections, stale dashboard responses, pitch-map default deduplication and public login.
- Backend: **146 pass / 34 fail**. The unchanged base independently reproduced the same 34 failures (138 pass / 34 fail); failure-name comparison found no new failures. The existing failures concern agent duplicate/manual-entry tests and related legacy expectations. This is not an entirely green suite.
- Ten focused concurrency/cache/filter/favourite tests pass. Tests check event-loop responsiveness during a blocked user query, fresh database roles overriding stale token roles, deleted-user rejection, unauthenticated requests avoiding the database, bounded workers, schema refresh deduplication, and invalidation during an in-flight read.
- Browser smoke check used the production frontend build served locally with only its API URL rewritten at response time to a synthetic local fixture server. Login, lazy home navigation, all three dashboard sections, and a recency filter change rendered successfully; captured browser error logs were empty. The fixture server recorded one `/users/me` request across login/dashboard consumers. This does **not** validate live Snowflake data or production authentication.

## Open issues and release gate

- Production position-history and technical-metrics HTTP 500 errors are **not claimed fixed**. The connected Snowflake role can inspect the schema, but cannot read `SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY`; Railway variable values are redacted. Queries for sampled player IDs through this connector returned no fixture KPI rows, so they cannot reproduce the failing production data path. Obtain actual exceptions under the API's production role and verify the affected profiles before considering this reliability item resolved. Do not substitute an unavailable response for an unknown database exception.
- Slow dashboard SQL still needs a production-role query profile to separate execution, warehouse wake-up, and queuing time. Existing authorization/read-state cache boundaries were retained.
- No paid resource changes, region moves, production deployments, or database writes were made for this work. A review/preview and representative live-data measurements are required before a production rollout; no live page-speed improvement is asserted yet.


## Follow-up: remove Technical Data tab and test pages

Removed the profile tab switcher, technical-data component and its stylesheet. The normal profile now renders for both ordinary links and old `?tab=technical` links. The independent `PlayerPositionPitchMap` component and its styles remain. There were no technical-metrics requests in the backend log during these updated profile checks.

The pitch map was present in production base commit `3fcbb6f`. It calls `/players/{id}/position-history`, which reads `CAFC_DB.CORE.CORE_PLAYER_FIXTURE_KPIS` and joins `CORE_COMPETITIONS`. The backend deduplicates repeated KPI rows by fixture/position, sums provider playing seconds into minutes and calculates each position's share of minutes. The frontend places circles at fixed position coordinates and scales their size by that percentage. These are position-minute summaries, not spatial tracking coordinates. Filters choose competition and season. Where no fixture data exists the map is hidden.

Live local browser checks used the existing authenticated test session and development database configuration. Dashboard, Scouting, Intel, Lists gateway, Internal Lists, External Recommendations, Emerging Talent, Internal Kanban, Analytics, Admin and player profiles were opened. The sampled pitch map returned CF 96.9% / AM 3.1%, and the removed tab was absent even on an old technical-tab URL. The Scouting browser initially showed a connection error after restart; its subsequent page load and separate API check succeeded. Do not interpret the first failed attempt as a passing test.

Eight read-only ASGI checks against the configured test clone succeeded: report listing, intel listing, the sampled profile, two position-history cases (available and unavailable), list index, lists with details and analytics timeline. These checks used an in-process test-admin dependency override; browser checks used the existing real local session. Writes, drag-and-drop changes, and record creation were not exercised. Newer email lifecycle flows remain limited by the older clone's missing lifecycle table. No database changes were made for these checks.

Final frontend verification: type check, optimized production build and all 23 tests pass. Local servers are stopped after testing. This does not replace production-role testing or establish live production latency.
