# Canonical-cutover read parity check (Phase 1+2)

Proves that the templated read endpoints return the **same data** whether they
read from legacy `RECRUITMENT_TEST.PUBLIC` (default seam config) or the new
`CAFC_DB.APP_COMPAT` layer (flipped) — for every role. Any difference is a real
cutover finding.

## What it hits

All Phase 1+2 templated reads: `search`, player `profile` (incl. dual-ID
resolvers + recommendation select), `analytics/timeline`, `analytics/timeline-daily`,
`intel_reports/all`, `agents/recommendations`, `internal/recommendations`.

Auth is `POST /token` (OAuth2 password form → bearer). Stdlib only — runs in any venv.

## Setup

```bash
cd backend
cp tools/cutover_compare/creds.example.json tools/cutover_compare/creds.json
# edit creds.json with a real login per role (file is gitignored)
```

## Run

1. **Default** — start backend normally, then capture:
   ```bash
   python main.py                       # log: READ_PREFIX=RECRUITMENT_TEST.PUBLIC
   python tools/cutover_compare/capture.py --label default \
          --creds-file tools/cutover_compare/creds.json
   ```

2. **Flipped** — restart backend pointed at the canonical layer, then capture:
   ```bash
   CANONICAL_DB=CAFC_DB PLATFORM_DB_SCHEMA=APP_COMPAT CORE_DB_SCHEMA=CORE python main.py
   # log: READ_PREFIX=CAFC_DB.APP_COMPAT
   python tools/cutover_compare/capture.py --label flipped \
          --creds-file tools/cutover_compare/creds.json
   ```

3. **Diff**:
   ```bash
   python tools/cutover_compare/diff.py --a default --b flipped
   ```
   `OK` everywhere (exit 0) = APP_COMPAT is a faithful mirror and role access is
   unchanged. `DIFF` / `STATUS` / `MISSING` = investigate that role+endpoint.

## Notes

- Want to compare the **branch vs `main`** instead of default-vs-flipped? Capture
  `--label main` while running `main`'s backend, then `--label branch` on this
  branch (both on defaults), and `diff.py --a main --b branch`. Should be identical
  (Phase 1+2 is a no-op under defaults).
- Lists are order-normalized by default (the two DBs may return rows in a
  different order without an `ORDER BY`). Use `--no-sort-lists` to keep server order.
- Request-time fields (`generated_at`, etc.) are blanked. Add more with
  `--volatile-key NAME` if you see timestamp-only diffs.
- Single role without a creds file: `--role scout --user U --password P`.
```
