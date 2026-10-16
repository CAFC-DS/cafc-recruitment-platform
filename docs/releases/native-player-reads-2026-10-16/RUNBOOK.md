# Reconciled native-player release — 16 October 2026

This branch starts at deployed application revision
`3db15bb03693b2edcaa99c8aa4c62ed1969fb1ae` (cutover/full) and ports only the
native-player projection, metadata/activation checks, recommendation query fix,
stable search ordering and optional squad-change table detection. Newer lifecycle,
email and performance code remains in place. No merge or deployment has run.

Report/list writer activation, normalised intel/recommendation writers, fixture
migration and table deletion are explicitly outside this smaller release. Their
previous implementation remains on the original migration branch. Existing
report/list writes are tested for read compatibility, not newly activated here.

## Current production facts and open gates

The October 16 audit confirmed READ_PREFIX=CAFC_DB.APP_COMPAT and
WRITE_PREFIX=CAFC_DB.CORE in the deployed cutover backend. Player creation in
that revision uses canonical storage. Two missing APP_ROLE SELECT grants remain
on CORE_PLAYER_CURRENT_CONTEXT and CORE_PLAYER_RECENT_POSITION; their exact SQL
and platform dbt patch are bundled as separate reviewed inputs. The persistent
platform fix is e409872; it has not been deployed by this work.

The frontend's selected backend, actual service-identity authentication and bare
SQL session defaults remain unconfirmed. Two backend services coexist in Railway;
both and the email worker/backfill must be inventoried before any maintenance.
Writers outside Railway, including scheduled dbt and matching jobs, also matter.
A prior read-only role-switch probe is not actual application authentication.

Production remains unchanged. Readiness stays false until every gate has current
operator evidence. No numeric latency budget is assumed or fabricated.

## Versioned correction installer

`backend/tools/normalisation/player_duplicate_release.py` operates only on the
five reviewed pairs. CORE requires an explicit --execute-production acknowledgement;
otherwise only CORE_DEV_CODEX_* targets are accepted. All operations require
--writers-stopped, an operator attestation rather than automatic proof of a pause.
The private env-file uses the established development/maintenance credential
mechanism; it does not load deployed application secrets.

Ledger preparation is a separate DDL operation. Apply and restore are DML-only
transactions. A successful apply records baseline and post-state in the same
transaction as the ten resolver overrides and five inactive flags. Failed apply
rolls back data and ledger together. Repeat execution verifies recorded state.
A restored release ID cannot be reused for a fresh apply. Restore uses the
same-schema recorded baseline, checks target/pair set, evidence drift and override
ownership, and restores original active flags and update timestamps. Player and
identity rows are never deleted. Existing overrides are never removed.

The Snowflake standard-table ledger does not enforce uniqueness. Externally
serialize installer execution and pause all writers; do not run concurrent
installers. The tool refuses duplicate ledger rows but cannot replace a verified
maintenance window. Baseline comparisons are deliberately strict: changed
references or player evidence require review rather than forced rollback.
Keep release evidence in the protected ledger and private artifact location.

## Release order after review and approval

1. Confirm frontend routing, deployed defaults, rollback deployment, owner and
   maintenance window. Review this branch's diff against 3db15bb and confirm the
   live revision has not advanced again. If it has, reconcile and retest first.
2. Deploy the reviewed application with NATIVE_PLAYER_READS=false. Preserve
   existing database, session-default and write settings. No write-domain switches
   are introduced by this release. Verify existing authenticated flows.
3. Apply the two SELECT grants through the owning platform deployment and verify
   the dbt persistence configuration. Repeat reads under the deployed service
   identity with secondary roles disabled. No other privilege is added.
4. Agree numeric p95/relative-regression limits, concurrency, warehouse size,
   duration and soak window; test representative workloads on the reconciled
   build. Previous three-sample timings are not production-load acceptance.
5. Pause and drain app replicas, email/background workers, ingestion, matching,
   dbt refreshes and other writers. Serialize installer execution. Save live
   configuration, refresh the full CORE/APP/MIGRATION/legacy reference audit and
   capture a current recovery snapshot with the owning database process.
6. Prepare the ledger separately, then run the reviewed installer with a unique
   release ID. CORE invocation requires --execute-production. Do not copy an old
   clone baseline into production. The installer audits its actual target inside
   the transaction and, for CORE, includes the legacy/live cross-schema references.
7. Verify exactly five removals, no changed survivors, all retained identity rows,
   stable resolver mappings and passing native validation. Check/rebuild the
   actual compatibility snapshot using its owning model if it remains fallback.
8. Set NATIVE_PLAYER_READS=true on the intended backend replicas; recycle
   connections and caches, verify activation, authenticated search/pagination,
   details, profiles, scout reports, intel and lists. Use only an agreed reversible
   fixture for live write smoke tests. Check caught SQL errors as well as HTTP status.
9. Resume writers in order, catch up queued work, revalidate after matcher/dbt
   runs, and observe the approved soak window. Record evidence and query IDs.

## Rollback

First disable native reads on all intended replicas and recycle connections and
caches. Verify fallback output/health. Leave successful canonical writes and data
correction in place unless they are the cause of the incident.

For a correction incident, keep native reads off, pause/drain writers again and
run --restore with the original release ID against the same schema. If ownership
or baseline evidence drifted, stop for reviewed reconciliation. A whole-table
replacement could lose subsequent writes and is not this rollback procedure.
Restoring the five active duplicates reinstates the original activation conflict;
native reads must remain disabled. SELECT grants do not redirect traffic and can
remain; removing them needs separate consumer and dbt review.

## Operator command shape

ENV_FILE is a private existing credential file and RESULT_DIR is a private,
pre-created evidence directory. SCHEMA must be an isolated clone for rehearsal.
These command shapes are not authorisation to execute against CORE.

```sh
python backend/tools/normalisation/player_duplicate_release.py --env-file "$ENV_FILE" --schema "$SCHEMA" --release-id "$RELEASE_ID" --writers-stopped --prepare-ledger --result "$RESULT_DIR/ledger.json"
python backend/tools/normalisation/player_duplicate_release.py --env-file "$ENV_FILE" --schema "$SCHEMA" --release-id "$RELEASE_ID" --writers-stopped --result "$RESULT_DIR/applied.json"
python backend/tools/normalisation/player_duplicate_release.py --env-file "$ENV_FILE" --schema "$SCHEMA" --release-id "$RELEASE_ID" --writers-stopped --restore --result "$RESULT_DIR/restored.json"
```

For approved production maintenance only, set SCHEMA=CORE and add
--execute-production to each operation. Native reads must be off before restore.
The installer itself never grants privileges, changes app flags, rebuilds snapshots,
pauses jobs or deploys services. Those operations need separately recorded evidence.
