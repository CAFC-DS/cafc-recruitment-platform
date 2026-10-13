# Email and agent lifecycle workstream specs

Base: cutover/full. Branch: codex/email-agent-lifecycle. No live sends or production mutations during development.

## 0 — Graph foundation
Client-credentials Graph service; cached token; one To recipient; Sent Items enabled. Preview, redirected test and allowlisted live modes. Persist immutable email batch, recipient jobs and append-only attempt log before sending. A single worker uses a transactional database mutex. Accepted is not delivered. Uncertain sends require admin review; never automatically retry them. Use bounded retries for explicit HTTP throttling/server errors. No SMTP reset changes.

## 3 — Agent resubmission
NCUC and latest-version only; original owner only; required change explanation. Reuse existing validated intake and preserve player name/DOB/canonical link. Insert new Submitted row with previous ID, change summary and creation history. Original unchanged. Use transactional mutex to prevent concurrent duplicate children. Show lineage to agents and staff. Migration required; feature fails closed when unavailable.

## 1 — Weekly digest
Monday 07:00 Europe/London, prior Monday-to-Monday created-at window. Player Assessments >=7 or Positive Flags; no Loan Reports or archived reports. Canonical player grouping, scout names, excerpts, authenticated links. Always send (including empty-week note). UTC cron at both 06:00 and 07:00 with UK guard. Week/recipient deduplication. Validate configured recipients have club-wide report access; trial redirected to Hashim.

## 2 — Admin lifecycle
Admin-only user selection/role selection/all agents; escaped text templates and individual preview. Saved batch recipient snapshot, confirmation, progress and retry only known failures. NCUC selected IDs or created-at date range; defaults Submitted/Under Review, explicit process status inclusion. Detect stale preview and apply all changes/history/batch atomically. Optional delayed notification containing only each agent's changed players. Agent wording and dates supplied at runtime.

## Acceptance
Mock Graph; test expiry, throttling, allowlist, uncertain sends. Verify digest bounds/BST/filter/grouping. Test NCUC stale selection/rollback/isolation and resubmission ownership/status/identity/concurrency. Typecheck frontend and exercise agent/admin UI. IT credential, migrations, test inbox verification and production recipient checks are release gates.
