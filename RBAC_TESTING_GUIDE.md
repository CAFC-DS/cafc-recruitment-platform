# 5-Tier RBAC System - Testing Guide

## Overview
This guide will help you test the new 5-tier role-based access control system.

## Step 1: Migrate Existing Roles (if needed)

1. **Login as an Admin** to your application
2. Navigate to the **Admin Dashboard**
3. Click the **"🔄 Migrate Roles"** button
   - This will migrate any existing `loan` role users to `loan_scout`
   - Safe to run multiple times
   - Check the success message for results

## Step 2: Create Test Users

1. Still on the **Admin Dashboard**, click **"👥 Create Test Users"**
2. This will create 5 test users (one for each role):

| Username | Role | Password |
|----------|------|----------|
| `test_admin` | admin | TestPassword123! |
| `test_senior_manager` | senior_manager | TestPassword123! |
| `test_manager` | manager | TestPassword123! |
| `test_loan_scout` | loan_scout | TestPassword123! |
| `test_scout` | scout | TestPassword123! |

3. The system will skip any users that already exist
4. Check the success message to see which users were created

## Step 3: Test Each Role

### Test 1: Scout Role (`test_scout`)

**Expected Access:**
- ✅ Can access: Scouting page, Home page
- ✅ Can see: ONLY their own scout reports
- ❌ Cannot see: Intel, Lists, Analytics, Admin
- ❌ Cannot see: Other scouts' reports

**Test Steps:**
1. Logout and login as `test_scout` / `TestPassword123!`
2. Check navbar - should only show "Scouting"
3. Try to access `/intel` - should redirect to home
4. Try to access `/lists` - should redirect to home
5. Try to access `/analytics` - should redirect to home
6. Try to access `/admin` - should redirect to home
7. Create a scout report and verify you can see it
8. Verify you cannot see reports from other users

### Test 2: Loan Scout Role (`test_loan_scout`)

**Expected Access:**
- ✅ Can access: Scouting page, Home page
- ✅ Can see: Their own scout reports + ALL loan reports (PURPOSE = "Loan Report")
- ❌ Cannot see: Intel, Lists, Analytics, Admin
- ❌ Cannot see: Other scouts' non-loan reports

**Test Steps:**
1. Logout and login as `test_loan_scout` / `TestPassword123!`
2. Check navbar - should only show "Scouting"
3. Create a scout report with PURPOSE = "Loan Report"
4. Create a scout report with PURPOSE = "Player Report"
5. Verify you can see both reports
6. Verify you can see ALL loan reports from all users
7. Verify you CANNOT see other users' Player Reports
8. Try to access `/intel`, `/lists`, `/analytics`, `/admin` - all should redirect

### Test 3: Manager Role (`test_manager`)

**Expected Access:**
- ✅ Can access: Scouting, Analytics, Home
- ✅ Can see: ALL scout reports (from all users)
- ❌ Cannot see: Intel, Lists, Admin

**Test Steps:**
1. Logout and login as `test_manager` / `TestPassword123!`
2. Check navbar - should show "Scouting" and "Analytics"
3. Navigate to scouting page - should see ALL scout reports
4. Navigate to analytics page - should see all analytics
5. Try to access `/intel` - should redirect to home
6. Try to access `/lists` - should redirect to home
7. Try to access `/admin` - should redirect to home

### Test 4: Senior Manager Role (`test_senior_manager`)

**Expected Access:**
- ✅ Can access: Scouting, Intel, Lists, Analytics, Home
- ✅ Can see: ALL scout reports, ALL intel reports
- ❌ Cannot see: Admin

**Test Steps:**
1. Logout and login as `test_senior_manager` / `TestPassword123!`
2. Check navbar - should show "Scouting", "Intel", "Lists", "Analytics"
3. Navigate to scouting page - should see ALL scout reports
4. Navigate to intel page - should see ALL intel reports
5. Navigate to lists page - should see all player lists
6. Navigate to analytics page - should see all analytics
7. Try to access `/admin` - should redirect to home
8. Try to create/edit player lists - should work
9. Try to create intel reports - should work

### Test 5: Admin Role (`test_admin`)

**Expected Access:**
- ✅ Can access: Everything (Scouting, Intel, Lists, Analytics, Admin)
- ✅ Can see: ALL data across the platform

**Test Steps:**
1. Logout and login as `test_admin` / `TestPassword123!`
2. Check navbar - should show ALL links including "Admin"
3. Navigate to all pages - all should work
4. Navigate to admin page - should see user management
5. Try creating/editing/deleting users - should work
6. Verify full access to all features

## Step 4: Verify Data Filtering

### Create Test Data
1. Login as `test_scout` and create 2 scout reports:
   - 1 with PURPOSE = "Player Report"
   - 1 with PURPOSE = "Loan Report"

2. Login as `test_loan_scout` and create 2 scout reports:
   - 1 with PURPOSE = "Player Report"
   - 1 with PURPOSE = "Loan Report"

### Verify Filtering
1. **Login as `test_scout`:**
   - Should see: Only their 2 reports
   - Total visible: 2 reports

2. **Login as `test_loan_scout`:**
   - Should see: Their 2 reports + test_scout's loan report
   - Total visible: 3 reports

3. **Login as `test_manager`:**
   - Should see: All 4 reports
   - Total visible: 4 reports

4. **Login as `test_senior_manager`:**
   - Should see: All 4 reports
   - Total visible: 4 reports

5. **Login as `test_admin`:**
   - Should see: All 4 reports
   - Total visible: 4 reports

## Step 5: Test API Endpoints Directly (Optional)

Use tools like Postman or curl to verify backend filtering:

```bash
# Get scout reports (with auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/scout_reports/all

# Should return filtered results based on role
```

## Common Issues & Solutions

### Issue: "Access Denied" errors
**Solution:** Ensure your user's role in the database matches one of the 5 valid roles

### Issue: Old role names in database
**Solution:** Run the "🔄 Migrate Roles" button in the admin panel

### Issue: Test users already exist
**Solution:** Either delete them manually or use existing test users

### Issue: Changes not reflecting
**Solution:**
1. Clear browser cache
2. Logout and login again
3. Restart backend server

## Role Summary Table

| Feature | Scout | Loan Scout | Manager | Senior Manager | Admin |
|---------|-------|------------|---------|----------------|-------|
| **Scouting Page** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **See Own Reports** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **See All Scout Reports** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **See All Loan Reports** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Intel Page** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Lists Page** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Analytics Page** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Admin Page** | ❌ | ❌ | ❌ | ❌ | ✅ |

## Backend Filtering Details

### Scout Reports
- **Scout:** `WHERE USER_ID = current_user.id`
- **Loan Scout:** `WHERE (USER_ID = current_user.id OR PURPOSE = 'Loan Report')`
- **Manager:** No filter (sees all)
- **Senior Manager:** No filter (sees all)
- **Admin:** No filter (sees all)

### Intel Reports
- **Scout:** No access (403)
- **Loan Scout:** No access (403)
- **Manager:** No access (403)
- **Senior Manager:** No filter (sees all)
- **Admin:** No filter (sees all)

### Analytics
- **Scout:** No access (403)
- **Loan Scout:** No access (403)
- **Manager:** Full access
- **Senior Manager:** Full access
- **Admin:** Full access

### Lists
- **Scout:** No access (403)
- **Loan Scout:** No access (403)
- **Manager:** No access (403)
- **Senior Manager:** Full access
- **Admin:** Full access

## Next Steps After Testing

1. **Update existing users** with appropriate roles
2. **Delete test users** once testing is complete (or keep for future reference)
3. **Document** any issues found during testing
4. **Train users** on the new role structure

---

**Questions or Issues?**
Contact your development team or create an issue in the project repository.
