# Railway Production Setup Guide

This guide walks you through setting up the production deployment on Railway with the APP_USER account.

## Step 1: Register APP_USER Public Key with Snowflake

Log into Snowflake with an account that has **ACCOUNTADMIN** privileges and run:

```sql
-- Switch to ACCOUNTADMIN
USE ROLE ACCOUNTADMIN;

-- Register the public key with APP_USER
ALTER USER APP_USER SET RSA_PUBLIC_KEY='MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzuQs+YEDZZPOBDVGBk27BkRzdW/oj8kPJbg6TOligPV/Md48LYOSXfPgXmGRra9e6S69m5VWronJdnjhiFuUHy2O+0n79l4aWMpZP6ar5ZLjC5VHEtDDpO6CxaYRunsaw7PaS+aofrKZg/AHJiFKtii3InZSmf4wY6sBLqqhwR9XoHP+6z1LYVjj/miYIPGVoMp4GiQusJFJWskOtUPUvNhTPIss3PmKxcjcuO7mROfID76F7jg/7YjmwUnMqpIm7bcg06tCIZzluV+h0Oc50xu4orPXZ1bzJqh9Y6G+41UgseXv8WElnQW+369pXVUpDk5y1xRBOSt/IP+wnB4o8wIDAQAB';

-- Verify the key was registered
DESC USER APP_USER;
-- Look for RSA_PUBLIC_KEY_FP (fingerprint) to confirm
```

## Step 2: Grant Permissions to APP_ROLE

Run these commands to grant APP_ROLE access to the database:

```sql
-- Grant database access to APP_ROLE
GRANT USAGE ON DATABASE RECRUITMENT_TEST TO ROLE APP_ROLE;

-- Grant schema access to APP_ROLE
GRANT USAGE ON SCHEMA RECRUITMENT_TEST.PUBLIC TO ROLE APP_ROLE;

-- Grant table permissions to APP_ROLE
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA RECRUITMENT_TEST.PUBLIC TO ROLE APP_ROLE;

-- Grant permissions on future tables
GRANT SELECT, INSERT, UPDATE, DELETE ON FUTURE TABLES IN SCHEMA RECRUITMENT_TEST.PUBLIC TO ROLE APP_ROLE;

-- Grant warehouse access
GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE APP_ROLE;
GRANT OPERATE ON WAREHOUSE COMPUTE_WH TO ROLE APP_ROLE;

-- Grant role to APP_USER (if not already granted)
GRANT ROLE APP_ROLE TO USER APP_USER;

-- Verify the grants were applied
SHOW GRANTS TO ROLE APP_ROLE;
```

## Step 3: Get Private Key Contents for Railway

The private key is located at: `backend/keys/app_user_rsa_key.pem`

You'll need to copy the **entire contents** of this file (including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines) to paste into Railway.

To display it in your terminal:

```bash
cat backend/keys/app_user_rsa_key.pem
```

**Copy the entire output** - you'll need it for the next step.

## Step 4: Configure Railway Environment Variables

Go to your Railway dashboard and add these environment variables:

### Required Production Variables:

```env
# Environment
ENVIRONMENT=production

# Snowflake Production Configuration
SNOWFLAKE_PROD_ACCOUNT=TDAPVGQ-SL30706
SNOWFLAKE_PROD_USERNAME=APP_USER
SNOWFLAKE_PROD_ROLE=APP_ROLE
SNOWFLAKE_PROD_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_PROD_DATABASE=RECRUITMENT_TEST
SNOWFLAKE_PROD_SCHEMA=PUBLIC

# Private Key (paste entire contents of app_user_rsa_key.pem here)
SNOWFLAKE_PRIVATE_KEY=<paste entire PEM file contents>

# CORS Configuration (CRITICAL for login to work)
CORS_ORIGINS=https://cafc-recruitment-platform.vercel.app,https://your-custom-domain.com

# Security
SECRET_KEY=ts1eguIT6d4mojHxpXu6Lv2LBtmBza7C-27_vwpJmRo
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Discord Webhook (optional)
DISCORD_WEBHOOK_URL=https://canary.discord.com/api/webhooks/1432379135128502354/UyGLO-YWcKxFc7UZ99TO0csx-LJmmzdVjXmlL5_fr424ItOqPMjtv9lO2F3I7zTlCPFX
```

### How to Add Variables in Railway:

1. Open your Railway project
2. Click on your backend service
3. Go to the **Variables** tab
4. Click **+ New Variable**
5. Add each variable one by one:
   - Variable name: e.g., `ENVIRONMENT`
   - Value: e.g., `production`
6. For `SNOWFLAKE_PRIVATE_KEY`:
   - Run `cat backend/keys/app_user_rsa_key.pem` in your terminal
   - Copy the **entire output** (including BEGIN/END lines)
   - Paste it as the value for `SNOWFLAKE_PRIVATE_KEY`

## Step 5: Deploy

After adding all environment variables:

1. **Redeploy** your Railway service (it should auto-deploy after adding variables)
2. Check the **deployment logs** in Railway
3. Look for this message in the logs:

```
🚀 PRODUCTION MODE: Connecting to Snowflake as APP_USER with role APP_ROLE using warehouse COMPUTE_WH
```

If you see this message, the configuration is correct!

## Step 6: Verify Production is Working

1. Open your frontend URL (Vercel)
2. Try to log in
3. Try to view scout reports
4. Check that everything works as expected

## Troubleshooting

### "Table does not exist or not authorized" errors

Run the GRANT commands from Step 2 again in Snowflake to ensure APP_ROLE has all necessary permissions.

### "SNOWFLAKE_PRIVATE_KEY environment variable not set"

Make sure you:
1. Set `ENVIRONMENT=production` in Railway
2. Added `SNOWFLAKE_PRIVATE_KEY` with the **full contents** of `app_user_rsa_key.pem`
3. Redeployed after adding variables

### Wrong warehouse being used

Check the Railway logs. You should see:
- `🚀 PRODUCTION MODE: Using APP_USER with COMPUTE_WH`

If you see `🔧 DEVELOPMENT MODE` instead, check that `ENVIRONMENT=production` is set correctly.

### CORS errors on login

Make sure `CORS_ORIGINS` includes your Vercel URL:
```
CORS_ORIGINS=https://cafc-recruitment-platform.vercel.app
```

## Summary Checklist

- [ ] Register APP_USER public key in Snowflake
- [ ] Grant permissions to APP_ROLE
- [ ] Copy private key contents from `app_user_rsa_key.pem`
- [ ] Add all environment variables to Railway
- [ ] Set `ENVIRONMENT=production`
- [ ] Set `SNOWFLAKE_PRIVATE_KEY` with full PEM contents
- [ ] Redeploy Railway service
- [ ] Check logs for "🚀 PRODUCTION MODE" message
- [ ] Test login and basic functionality

## Success!

Once you see the production mode message in Railway logs and can successfully log in from your Vercel frontend, the migration is complete! 🎉

Your application now uses:
- **Development**: HUMARJI + DEVELOPMENT_WH + DEV_ROLE (local)
- **Production**: APP_USER + COMPUTE_WH + APP_ROLE (Railway)
