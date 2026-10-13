# Resubmission release

Resubmission can ship independently of email. No Microsoft Graph secret, mailbox,
email worker, cron service or agent notification wording is needed.

## Behaviour

Only the owning agent can resubmit their latest recommendation while its status
is Not Currently under Consideration. The form copies the original details,
keeps player identity fixed and requires an explanation of what changed. Saving
creates a new Submitted recommendation linked to the original; it leaves the
original unchanged. Both versions link to each other and staff see the explanation.

An older submission with no existing player link needs staff to link it first.
The form explains this rather than inviting the agent to create another player.

## Database setup

Use `backend/migrations/20261008_agent_resubmission.sql` for this release. The
larger email migration is not required. Select the API's configured canonical
database/schema explicitly; do not alter a compatibility view. Run with the
table owner's privileges while recommendation/status writers are stopped.

The migration adds PREVIOUS_RECOMMENDATION_ID and RESUBMISSION_CHANGES and creates
the one-row LIFECYCLE_MUTEX. Grant SELECT/UPDATE on that table to the API role.
Its existing recommendation and status-history writes must remain available.
Verify exactly one mutex row, with ID=1, then restart the API to refresh its cache.
The migration can also run after the combined migration because its statements
are idempotent when run serially.

On 9 October 2026, the resubmission-only migration was applied to CAFC_DB.CORE
using the table owner DEV_ROLE. SELECT/UPDATE on LIFECYCLE_MUTEX were granted to
DEV_ROLE and APP_ROLE. The local backend on port 8055 explicitly uses CAFC_DB
for both its connection and canonical reads/writes; email sending is disabled.

## Acceptance checks on the selected test database

1. As an agent, open an owned NCUC recommendation with a linked player. Follow
   Resubmit with new details. Check the prefilled fields and fixed identity.
2. Change deal details and enter What's changed. Submit and check the new row is
   Submitted, keeps the same player link and points to the original ID.
3. Confirm the original fields/status/history are unchanged and the new row has
   its creation history. Check the version links in agent and staff views.
4. Try another agent's ID, a non-NCUC ID, an empty explanation and an old version
   that already has a child. Each must reject without creating a row.
5. Submit simultaneously from two sessions. Exactly one should create a row;
   the other should receive a conflict. Also test a simultaneous staff status
   change to verify both paths obey Snowflake's transaction mutex.

Local mocked backend tests and frontend component tests cover the validation and
form contract. The actual API was also tested against CAFC_DB.CORE on 9 October:
ownership and required explanation rejected correctly; two simultaneous requests
returned 200 and 409; exactly one linked Submitted row was created with updated
deal details and creation history; the original remained unchanged. The temporary
original and child plus their history were removed, and zero marked rows remained.
The API test injected an authenticated agent dependency rather than using a real
browser login. A full authenticated browser acceptance check remains outstanding.

Deploy the API and frontend from codex/email-agent-lifecycle after these checks.
Email sending remains disabled independently. For rollback, restore the previous
application version and leave the additive columns and version history intact.
