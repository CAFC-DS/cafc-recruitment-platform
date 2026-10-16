# Reconciliation and verification

Base: deployed cutover/full revision 3db15bb03693b2edcaa99c8aa4c62ed1969fb1ae.
Branch: codex/native-player-release-current. No existing branch was merged.

Only eight existing main.py functions change: schema load/refresh, read routing,
connection validation, recommendation SELECT, player-system status, search and
optional list squad-change detection. One metadata helper is added. An AST
comparison confirms every other existing function is unchanged, preserving newer
email/lifecycle and performance work. Canonical report/list writer switches are
not ported or activated.

## Current results

- Final installer: 4 tests passed, including a real fresh-clone transaction
  rehearsal. Checks cover injected failure with no committed ledger, exactly
  five removed projection rows, repeat application, override ownership refusal,
  baseline restoration, repeat restoration, refusal to reuse a restored ID and
  successful application under a new ID. The two production-target/pair guards
  and changed-provider guard also pass. Ledger, mutation and restoration were
  exercised only in isolated schemas. No production correction was attempted.

- Full default backend: 181 passed, 34 failed, 6 skipped. Clean deployed baseline:
  146 passed, 34 failed. Failed-test identifiers match exactly; this is not a
  green suite. Skipped tests require explicit isolated database access.
- 20 API comparisons return matching HTTP 200 JSON with zero caught SQL errors.
  Profiles cover admin/scout/loan/intel roles; scout report details/rendered/feed,
  lists/memberships, search, filters, leagues and competition filters are included.
- The complete current recommendation SELECT matches all 604 rows and columns,
  including newer lifecycle fields. Hashes rather than report bodies are saved.
- The corrected player projection has zero unexpected full-row differences in
  both directions after allowing exactly the five reviewed retired records.
- The live dependency audit still passes across 59 reference columns in CORE,
  APP, MIGRATION and legacy PUBLIC. This must be repeated during the eventual
  writer pause; a read-only audit is not evidence that writers are paused.

The first API run exposed a rehearsal setup gap: the current deployed scout SQL
still uses the compatibility MATCHES shape. A frozen copy from APP_COMPAT was
added to the isolated clone, and all checks were rerun successfully. No fixture
migration was added to production code to make the tests pass.

## Query medians (seconds, three uncached samples)

| Query | Snapshot | Native |
|---|---:|---:|
| detail | 0.120 | 0.224 |
| search | 0.299 | 0.514 |
| report join | 0.116 | 0.290 |
| list join | 0.368 | 0.451 |

These development-warehouse samples at production-sized data volume do not
establish concurrent production p95 or an agreed latency budget. Authentication
uses test dependency overrides and database access uses development credentials.
Actual service-identity authentication, frontend routing, remaining bare-SQL
session defaults, grants, fallback freshness and production load acceptance
remain release gates. No browser/login or live user writes were performed.

Machine evidence lives under backend/tools/normalisation/test-results/2026-10-16.
The original platform grant patch remains under test-results/2026-10-10 and has
not been deployed. No production flags, permissions, data or services changed.
