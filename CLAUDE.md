# Recruitment Platform - Claude Instructions

## Project Structure
- Backend: Python/FastAPI
- Frontend: React/TypeScript
- Database: Snowflake

## Role-Based Permissions
The platform has four user roles with different access levels:

### Admin Role
- Full access to all features
- Can see ALL scout reports (no filtering)
- Access to admin panel, analytics, and all pages

### Manager Role
- Can see ALL scout reports (no filtering)
- Access to analytics dashboard
- Access to all players and reports

### Scout Role
- Can only see their OWN scout reports (filtered by USER_ID)
- Limited to reports they personally created
- No access to analytics or admin features

### Loan Role
- Can see their OWN reports (Player Assessments, Flags, Clips) that they created
- Can see ALL Loan Reports regardless of who created them
- Filter: `(USER_ID = current_user.id OR PURPOSE = 'Loan Report')`
- This allows them to work like a scout but also view everyone's loan reports
- No access to analytics or admin features

## Commands
- Backend: python main.py
- Frontend: npm start
- Lint: npm run lint (if available)
- Test: npm test (if available)

## Notes
- Maintain all existing functionality
- Focus on minimal, targeted changes
- Test role-based access thoroughly
- Backend handles all filtering logic (frontend just displays results)

