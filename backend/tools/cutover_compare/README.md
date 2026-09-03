# Cutover read-parity check — RECRUITMENT_TEST.PUBLIC → CAFC_DB.APP

Proves the read endpoints return the **same data** whether the app reads from
legacy `RECRUITMENT_TEST.PUBLIC` or the cloned `CAFC_DB.APP` schema — for every
role. Any difference is a real cutover finding.

Plan: `~/.claude/plans/hello-i-need-some-ancient-hopcroft.md` (P1.4). This covers
**reads** only; the manual per-role checklist (`docs/cutover/p1-checklist.md`)
covers the write paths.

## What it hits

`search`, player `profile`, `analytics/timeline`, `analytics/timeline-daily`,
`intel_reports/all`, `agents/recommendations`, `internal/recommendations` — for
each role in `creds.json`. Auth is `POST /token`. Stdlib only.

## Setup

```bash
cd backend
cp tools/cutover_compare/creds.example.json tools/cutover_compare/creds.json
# fill creds.json with one real login per role (file is gitignored):
#   admin, senior_manager, manager, loan_manager, scout, intel_reviewer, agent
```

## Run (dry run, P1.4)

1. **Baseline** — backend on legacy config:
   ```bash
   ENVIRONMENT=production \
   SNOWFLAKE_PROD_DATABASE=RECRUITMENT_TEST SNOWFLAKE_PROD_SCHEMA=PUBLIC \
   CANONICAL_DB=RECRUITMENT_TEST PLATFORM_DB_SCHEMA=PUBLIC CORE_DB_SCHEMA=PUBLIC \
   python main.py            # log: READ_PREFIX=RECRUITMENT_TEST.PUBLIC
   python tools/cutover_compare/capture.py --label base \
          --creds-file tools/cutover_compare/creds.json
   ```

2. **Flipped** — backend pointed at the clone:
   ```bash
   ENVIRONMENT=production \
   SNOWFLAKE_PROD_DATABASE=CAFC_DB SNOWFLAKE_PROD_SCHEMA=APP_DRYRUN \
   CANONICAL_DB=CAFC_DB PLATFORM_DB_SCHEMA=APP_DRYRUN CORE_DB_SCHEMA=APP_DRYRUN \
   python main.py            # log: READ_PREFIX=CAFC_DB.APP_DRYRUN
   python tools/cutover_compare/capture.py --label flip \
          --creds-file tools/cutover_compare/creds.json
   ```

3. **Diff**:
   ```bash
   python tools/cutover_compare/diff.py --a base --b flip
   ```
   `OK` everywhere (exit 0) = the clone is a faithful mirror and role access is
   unchanged → P2 gate. `DIFF` / `STATUS` / `MISSING` = investigate that
   role+endpoint, log it in `docs/cutover/p1-findings.md`.

At P3 (live cutover) capture `--label cutover_live` against prod after the flip
and `diff.py --a flip --b cutover_live`.

## Notes

- Lists are order-normalized by default (no `ORDER BY` → arbitrary row order).
  `--no-sort-lists` keeps server order.
- Request-time fields (`generated_at`, …) are blanked; add more with
  `--volatile-key NAME` if you see timestamp-only diffs.
- Single role: `--role scout --user U --password P` (no creds file).
