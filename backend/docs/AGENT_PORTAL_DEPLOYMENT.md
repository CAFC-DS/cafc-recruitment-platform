# External Player Recommendation Portal Deployment

## Test-release scope
This test release ships with:
- agent registration and login
- agent submission and tracking
- internal status management and shared agent-visible notes
- status history

This test release does not ship with:
- supporting file uploads
- automated status email notifications

## Backend environment
No new SMTP or Snowflake stage environment variables are required for this test release.

The existing Snowflake connection variables remain required.

## Release steps
1. Deploy backend code with the new recommendation routes.
2. Run `backend/migrations/20260228_external_player_recommendation_portal.sql` in Snowflake.
3. Confirm `PLAYER_RECOMMENDATIONS` contains the base business columns and add `PLAYER_NAME` if it is not already present.
4. Confirm `USERS` contains the `EMAIL`, `FIRSTNAME`, and `LASTNAME` columns.
5. Deploy the frontend.
6. Create a test agent account through `/agents/register`.
7. Submit a recommendation.
8. Change status from the internal recommendations page and confirm history updates correctly.

## Security checks
- Agents should only access `/agents/*` pages.
- Shared review notes should be visible to the submitting agent.
- Supporting file routes should not be used in this release.
