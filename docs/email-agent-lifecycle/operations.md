# Deployment and trial runbook

Branch: `codex/email-agent-lifecycle`, based on `cutover/full` (`eb29992`).

## Database release

For resubmission alone, follow [the independent release guide](resubmission-release.md)
and use `backend/migrations/20261008_agent_resubmission.sql`. Email tables and
services can be added later with the combined migration below.

1. Use a staging canonical schema first. Run `backend/migrations/20261007_email_agent_lifecycle.sql` as its owner after explicitly choosing the database/schema configured by `CANONICAL_DB` and `CORE_DB_SCHEMA`. Do not target the APP_COMPAT bridge.
2. Grant the backend and email worker roles SELECT/INSERT/UPDATE on EMAIL_BATCHES, EMAIL_JOBS, EMAIL_LOG and LIFECYCLE_MUTEX. The app also needs its existing recommendation/status-history privileges. No application runtime DDL is used.
3. Verify LIFECYCLE_MUTEX contains exactly one row with ID=1. All lifecycle writers and existing staff status updates serialize using an UPDATE in an explicit transaction; do not add replicas without the staging concurrency check below.
4. Restart the backend after migration. The recommendation schema cache now describes the canonical recommendation table so new columns need not be added to compatibility views.
5. Confirm two simultaneous resubmissions produce one new recommendation and one conflict. Confirm a stale NCUC preview aborts without partial updates. These Snowflake-specific checks cannot be established by the local SQLite/mocked suite alone.

Recommendation reads remain compatible before migration. Resubmission and email batch operations fail closed until required schema/privileges exist.

## Railway services

Use this branch and the `backend` root directory for all three services:

- Existing API: existing `railway.json` and uvicorn command.
- Email worker: config file `/backend/railway.email-worker.json`, start `python tools/email_worker.py`, one replica, no HTTP healthcheck.
- Weekly digest: config file `/backend/railway.weekly-digest.json`, start `python tools/weekly_digest.py --scheduled`, cron `0 6,7 * * 1`, no HTTP healthcheck. Both UTC hours run; the UK guard chooses 07:00 in GMT/BST. The digest queues work and exits; the worker performs sends.

Give worker and cron the same canonical Snowflake configuration as the API. Configure `FRONTEND_URL` as the HTTPS platform origin. No Vercel/browser environment variable should contain a Graph credential.

## Mailbox settings

Configure securely in Railway:

- MS_GRAPH_TENANT_ID: `4d3dd4a3-5a61-4ffc-b246-4a4f3ea15b97`
- MS_GRAPH_CLIENT_ID: `6eff004c-36ea-49ca-ad72-f70bb498455e`
- MS_GRAPH_CLIENT_SECRET: credential supplied separately by IT
- MS_GRAPH_SENDER: `playerrecruitment@cafc.co.uk`
- EMAIL_DRY_RUN: `true` initially; `false` enables actual transport
- EMAIL_LIVE_ENABLED: `false` throughout trial
- EMAIL_TEST_RECIPIENT: Hashim's approved inbox
- EMAIL_ALLOWLIST: that same inbox during trial, then approved live recipient addresses; empty allowlist permits all intended recipients only when EMAIL_LIVE_ENABLED=true
- DIGEST_RECIPIENTS: verified user email addresses; use Hashim for the initial trial if his role is admin/manager/senior_manager, then the three verified staff addresses
- DIGEST_MODE: `test` initially; `live` after acceptance

Preview is separate from sending. `--dry-run` does not request Graph tokens, queue jobs or write logs. Test mode sends one redirected message per intended recipient and prefixes the subject `[TEST]`. No mode sends while EMAIL_DRY_RUN is true.

## Read-only preflight and digest trial

From `backend` with the configured secure environment:

```sh
python tools/email_preflight.py
python tools/weekly_digest.py --dry-run
python tools/weekly_digest.py --dry-run --to your-approved-address
python tools/weekly_digest.py --mode test --to your-approved-address
```

Preflight checks required tables/columns, recent report scores, named staff accounts, email configuration and the current qualifying report/player counts. It does not authenticate to Graph or send emails. Preflight and digest accept `--env-file /secure/path` to read an existing file without copying it; run from the backend directory that contains any relative key paths.

Compare dry-run reports to the same Snowflake predicates: Player Assessment with numeric score >=7, or Positive Flag; exclude archived and Loan Report purpose; CREATED_AT is UTC, bounded by previous Monday 07:00 UK and this Monday 07:00 UK.

A week/mode has one saved digest batch. Configuration changes do not resend the same week. Preview and test/live modes have separate identities. Known failed or blocked recipients can be retried from the admin screen.

Before activation verify the mailbox's Sent Items and receipt in Hashim's inbox, single To recipient and no CC/BCC, profile links after login, and the three staff accounts' roles. Graph 202 means accepted, not delivered. Delivery/bounce tracking and mailbox reading are outside Mail.Send-only scope.

## Admin workflow

Open `/admin/email` from Admin Operations Console, or select recommendation checkboxes in External Recommendations and follow the email/NCUC link.

For general messages: choose selected users, a role (including all agents), or all platform users; enter subject and message; preview the immutable recipient/content snapshot; send a test batch; then confirm live if configured. General emails deduplicate shared addresses.

For NCUC: use explicit IDs or an inclusive UK submission-date range. Default statuses are Submitted and Under Review; opt into Emerging Talent/First Team process explicitly. Preview, then confirm status changes. No email is sent by that action. Saved applied batches remain available for a later notification.

For notifications: reopen an applied NCUC batch, supply the agreed wording, preview each agent's player list, test, then confirm live. Agent recipients remain separate even for a shared address. The first confirmed batch for an NCUC batch/mode wins; later previews cannot silently alter or repeat it. Missing/conflicting addresses are listed and excluded; correct addresses before applying a fresh NCUC batch or use a deliberate selected-user message for follow-up.

Queued jobs are durable. Accepted jobs are never automatically repeated. Known failed/blocked jobs can be requeued. A worker interrupted after starting a send leaves a sending job; after 15 minutes it becomes uncertain and the batch needs attention. Review Sent Items, record the mailbox check on the uncertain job, and explicitly confirm previously sent or not sent. Only a confirmed-not-sent job becomes eligible for retry. Do not treat uncertain jobs as proof of failure.

## Release gates

- IT credential supplied through its secure channel.
- Owner-run migrations, application grants and Snowflake transaction/concurrency checks passed.
- Hashim's test recipient and agent notification wording provided.
- Phil/Calvin/Liam email addresses and full-report access verified.
- Real test receipt, profile links and digest list comparison confirmed.

For rollback, disable live sending and stop the worker/cron before rolling back the application. Leave new tables/columns and audit data intact; stop services before any schema cleanup. No production recommendation changes or sends are performed by installing this code.
