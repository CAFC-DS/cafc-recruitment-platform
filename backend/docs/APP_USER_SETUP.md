# Snowflake APP_USER Setup Guide

This guide explains how to set up and use the environment-based Snowflake connection system for the Recruitment Platform.

## Overview

The application now supports two different Snowflake configurations based on the `ENVIRONMENT` variable:

- **Development Mode** (`ENVIRONMENT=development`): Uses your personal Snowflake account (`HUMARJI`) with the `DEVELOPMENT_WH` warehouse for local testing
- **Production Mode** (`ENVIRONMENT=production`): Uses the dedicated application account (`APP_USER`) with the `COMPUTE_WH` warehouse for deployed instances

## Quick Start

### 1. Generate RSA Key-Pair for APP_USER

```bash
cd backend
python generate_app_keypair.py
```

This script will:
- Generate a new 2048-bit RSA key-pair
- Save the private key to `keys/app_user_rsa_key.pem`
- Save the public key to `keys/app_user_rsa_key.pub`
- Display the public key formatted for Snowflake registration
- Show you the exact SQL command to run

### 2. Register Public Key with Snowflake APP_USER

Log into Snowflake with an account that has `ACCOUNTADMIN` privileges and run:

```sql
-- Register the public key (output from the script)
ALTER USER APP_USER SET RSA_PUBLIC_KEY='<public_key_from_script>';

-- Verify the key was registered
DESC USER APP_USER;
-- Look for RSA_PUBLIC_KEY_FP (fingerprint) to confirm
```

### 3. Grant Permissions to APP_USER

Ensure APP_USER has the necessary permissions:

```sql
-- Grant role to user
GRANT ROLE APP_ROLE TO USER APP_USER;

-- Grant warehouse access
GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE APP_ROLE;

-- Grant database and schema access
GRANT USAGE ON DATABASE RECRUITMENT_TEST TO ROLE APP_ROLE;
GRANT USAGE ON SCHEMA RECRUITMENT_TEST.PUBLIC TO ROLE APP_ROLE;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA RECRUITMENT_TEST.PUBLIC TO ROLE APP_ROLE;
GRANT SELECT, INSERT, UPDATE, DELETE ON FUTURE TABLES IN SCHEMA RECRUITMENT_TEST.PUBLIC TO ROLE APP_ROLE;

-- Verify grants
SHOW GRANTS TO ROLE APP_ROLE;
```

### 4. Configure Environment Variables

#### For Local Development

Your `.env` file should already be configured with:

```env
ENVIRONMENT=development

# Development Configuration (your personal account)
SNOWFLAKE_DEV_ACCOUNT=TDAPVGQ-SL30706
SNOWFLAKE_DEV_USERNAME=HUMARJI
SNOWFLAKE_DEV_ROLE=SYSADMIN
SNOWFLAKE_DEV_WAREHOUSE=DEVELOPMENT_WH
SNOWFLAKE_DEV_DATABASE=RECRUITMENT_TEST
SNOWFLAKE_DEV_SCHEMA=PUBLIC
SNOWFLAKE_DEV_PRIVATE_KEY_PATH=./keys/rsa_key_unencrypted.pem
```

#### For Production (Railway Deployment)

In Railway dashboard, set these environment variables:

```env
ENVIRONMENT=production

# Production Configuration (APP_USER account)
SNOWFLAKE_PROD_ACCOUNT=TDAPVGQ-SL30706
SNOWFLAKE_PROD_USERNAME=APP_USER
SNOWFLAKE_PROD_ROLE=APP_ROLE
SNOWFLAKE_PROD_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_PROD_DATABASE=RECRUITMENT_TEST
SNOWFLAKE_PROD_SCHEMA=PUBLIC

# For Railway, paste the contents of app_user_rsa_key.pem as a string
SNOWFLAKE_PRIVATE_KEY=<paste entire PEM file contents here>
```

## Testing

### Test Development Mode

```bash
# Ensure ENVIRONMENT=development in .env
cd backend
python main.py
```

You should see:
```
🔧 DEVELOPMENT MODE: Connecting to Snowflake as HUMARJI with role SYSADMIN using warehouse DEVELOPMENT_WH
```

### Test Production Mode (Locally)

Temporarily change `.env`:
```env
ENVIRONMENT=production
```

Then run:
```bash
python main.py
```

You should see:
```
🚀 PRODUCTION MODE: Connecting to Snowflake as APP_USER with role APP_ROLE using warehouse COMPUTE_WH
```

**IMPORTANT**: Change back to `development` after testing!

### Test Utility Scripts

```bash
# Test with development config
python analyze_all_reports.py

# Test with production config
ENVIRONMENT=production python analyze_all_reports.py
```

## Architecture

### Connection Flow

```
┌─────────────────────────────────────┐
│   Application Startup               │
│   Reads ENVIRONMENT variable        │
└─────────────┬───────────────────────┘
              │
         ┌────▼─────┐
         │ Development? │
         └────┬────────┘
              │
    ┌─────────┴─────────┐
    │                   │
   YES                 NO
    │                   │
    ▼                   ▼
┌──────────────┐   ┌──────────────┐
│ Load DEV_*   │   │ Load PROD_*  │
│ variables    │   │ variables    │
│              │   │              │
│ HUMARJI      │   │ APP_USER     │
│ DEVELOPMENT_WH│   │ COMPUTE_WH   │
│ SYSADMIN     │   │ APP_ROLE     │
│ Dev Key      │   │ App Key      │
└──────┬───────┘   └──────┬───────┘
       │                   │
       └─────────┬─────────┘
                 │
                 ▼
        ┌────────────────┐
        │ Create         │
        │ Snowflake      │
        │ Connection     │
        └────────────────┘
```

### Files Modified

The following files have been updated with environment-based configuration:

1. **backend/main.py** - Main FastAPI application
   - Lines 372-396: Environment-based config loading
   - Line 476: Added `role` parameter to connection

2. **backend/analyze_all_reports.py** - Report analysis utility
   - Lines 28-50: Environment-based config loading
   - Line 86: Added `role` parameter to connection

3. **backend/import_multiple_archived_reports.py** - Report import utility
   - Lines 27-49: Environment-based config loading
   - Line 175: Added `role` parameter to connection

4. **backend/backfill_team_ids.py** - Team ID backfill utility
   - Lines 21-43: Environment-based config loading
   - Line 68: Added `role` parameter to connection

5. **backend/check_empty_data.py** - Data validation utility
   - Lines 13-35: Environment-based config loading
   - Line 72: Added `role` parameter to connection

6. **backend/check_duplicate_reports.py** - Duplicate check utility
   - Lines 13-35: Environment-based config loading
   - Line 62: Added `role` parameter to connection

## Troubleshooting

### Connection Fails with "Object 'USERS' does not exist"

This means the role doesn't have access to the USERS table. Fix:

```sql
GRANT SELECT ON TABLE RECRUITMENT_TEST.PUBLIC.USERS TO ROLE APP_ROLE;
```

### "SNOWFLAKE_PRIVATE_KEY environment variable not set" Error

In production, the app expects `SNOWFLAKE_PRIVATE_KEY` as an environment variable (not a file path).

**Solution**: Copy the contents of `app_user_rsa_key.pem` and paste it as the value of `SNOWFLAKE_PRIVATE_KEY` in Railway.

### Wrong Warehouse Being Used

Check the logs when the application starts. You should see either:
- `🔧 DEVELOPMENT MODE: Using HUMARJI with DEVELOPMENT_WH`
- `🚀 PRODUCTION MODE: Using APP_USER with COMPUTE_WH`

If you see the wrong message, check your `ENVIRONMENT` variable.

### Key-Pair Authentication Fails

1. **Verify the public key is registered**:
   ```sql
   DESC USER APP_USER;
   ```
   Look for `RSA_PUBLIC_KEY_FP` field

2. **Check the private key format**:
   ```bash
   head -n 1 keys/app_user_rsa_key.pem
   ```
   Should show: `-----BEGIN PRIVATE KEY-----`

3. **Regenerate keys if needed**:
   ```bash
   python generate_app_keypair.py
   # Follow the instructions to register the new public key
   ```

### Role Not Set Correctly

If queries fail with permission errors:

```sql
-- Check current role
SELECT CURRENT_ROLE();

-- Manually set role (temporary fix)
USE ROLE APP_ROLE;

-- Permanent fix: Ensure SNOWFLAKE_*_ROLE env var is set correctly
```

## Security Best Practices

1. **Never commit private keys** to version control
   - The `.gitignore` is configured to exclude all key files
   - Always use environment variables for production keys

2. **Rotate keys regularly** (recommended every 90 days)
   ```bash
   python generate_app_keypair.py
   # Register new public key in Snowflake
   # Update production environment variables
   ```

3. **Use different keys for different environments**
   - Development: `rsa_key_unencrypted.pem` (personal account)
   - Production: `app_user_rsa_key.pem` (app account)

4. **Limit APP_USER permissions**
   - Grant only necessary permissions to APP_ROLE
   - Avoid using `ACCOUNTADMIN` or `SYSADMIN` roles for the app

5. **Monitor usage**
   ```sql
   -- Check APP_USER activity
   SELECT * FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
   WHERE USER_NAME = 'APP_USER'
   ORDER BY START_TIME DESC
   LIMIT 100;
   ```

## FAQ

**Q: Why do we need two different accounts?**
A: Separation of concerns - your personal account for development/testing, and a dedicated app account for production with limited permissions.

**Q: Can I use password authentication instead of key-pair?**
A: Key-pair authentication is more secure and recommended. Password support is kept for backward compatibility but not actively used.

**Q: What happens if I don't set environment variables?**
A: The system falls back to legacy `SNOWFLAKE_*` variables for backward compatibility, but you won't get environment-specific configuration.

**Q: How do I switch between environments?**
A: Change the `ENVIRONMENT` variable in your `.env` file:
- `ENVIRONMENT=development` for local development
- `ENVIRONMENT=production` for production testing

**Q: Do utility scripts use the same logic?**
A: Yes! All utility scripts (analyze, import, backfill, etc.) use the same environment-based configuration.

## Additional Resources

- [Snowflake Key-Pair Authentication Documentation](https://docs.snowflake.com/en/user-guide/key-pair-auth.html)
- [Snowflake Role-Based Access Control](https://docs.snowflake.com/en/user-guide/security-access-control-overview.html)
- [Railway Environment Variables Guide](https://docs.railway.app/develop/variables)

## Support

If you encounter issues:
1. Check this documentation first
2. Review the troubleshooting section
3. Check application logs for detailed error messages
4. Verify Snowflake permissions with the SQL commands above
