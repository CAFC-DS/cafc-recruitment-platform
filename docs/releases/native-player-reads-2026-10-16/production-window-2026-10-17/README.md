# Production switch-over — 17 October 2026

Native player reads and the five duplicate-player retirements went live on
17 October 2026 (Europe/London times below).

| Time (BST) | Step | Evidence |
|---|---|---|
| 16 Oct 21:10 | Authorised prod dbt refresh of the five player models; APP_ROLE grants persisted | `pre-refresh.json`, `post-refresh.json` |
| 17 Oct 21:18 | Installer rehearsed on a fresh clone of live CORE (`CORE_DEV_CODEX_PRERUN_20261017_47F1B1`): exactly 5 inactive + 10 overrides, validation passes | `rehearsal-on-live-clone/` |
| 22:18 | PR #38 deployed with `NATIVE_PLAYER_READS` off; health OK | Railway deployments `398daddc`, `9bc9ccb4` |
| 22:20 | Backend and email worker deployments removed; CORE writes quiet for 3+ minutes | `writers-quiet.json` |
| 22:24 | Recovery clone `CAFC_DB.CORE_BACKUP_NATIVE_20261017` | `recovery-point.json` |
| 22:28–22:29 | Installer run by the operator: release `native-player-dup-20261017`, ledger state APPLIED | `ledger.json`, `applied.json` |
| 22:30 | Verified against the recovery clone: only players 1282585, 1299064, 1350827, 1354027, 1365024 changed (now inactive), 10 overrides added, identities unchanged, native validation passes | `verify.json` |
| 22:34 | Backend redeployed with `NATIVE_PLAYER_READS=true` | Railway deployment `3003c70e` |
| 18 Oct 07:06 | Email worker restored by rollback to the 22:17 build (a rebuild had failed on Python 3.13; see `backend/.python-version`) | Railway deployment `0e45ee13` |
| 07:07 | Fallback `players_base`/`players` rebuilt: no retired players, exact parity with native reads | thread check |

Overnight (22:34–06:00): 158 requests, zero 5xx, health check passing.

## Rollback

- Reads: set `NATIVE_PLAYER_READS=false` on `dependable-adventure` and redeploy.
- Correction: with native reads off and writers paused, run
  `player_duplicate_release.py --schema CORE --execute-production --writers-stopped --restore --release-id native-player-dup-20261017`.
- The recovery clone keeps the pre-correction CORE state.
