# 🚀 Vercel + Railway Deployment Guide

## 📋 **Prerequisites**

- GitHub account
- Vercel account (free)
- Railway account (free tier available)
- Snowflake database credentials

## 🔧 **Step 1: Prepare Your Repository**

### **1.1 Push to GitHub**
```bash
# Initialize git if not already done
git init
git add .
git commit -m "Prepare for deployment"

# Push to GitHub
git remote add origin https://github.com/your-username/your-repo-name.git
git push -u origin main
```

### **1.2 Generate Secret Key**
```bash
# Generate a secure secret key for JWT
python -c "import secrets; print(secrets.token_urlsafe(32))"
# Copy this output - you'll need it for Railway
```

## 🚂 **Step 2: Deploy Backend on Railway**

### **2.1 Create Railway Project**
1. Go to [railway.app](https://railway.app)
2. Sign up/login with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your repository
6. Select the `backend` folder as root directory

### **2.2 Configure Environment Variables**
In Railway dashboard, go to Variables tab and add:

```bash
# Database Configuration
SNOWFLAKE_USERNAME=your_snowflake_username
SNOWFLAKE_PASSWORD=your_snowflake_password
SNOWFLAKE_ACCOUNT=your_account.region.snowflakecomputing.com
SNOWFLAKE_WAREHOUSE=your_warehouse_name
SNOWFLAKE_DATABASE=your_database_name
SNOWFLAKE_SCHEMA=PUBLIC

# Security Configuration
SECRET_KEY=your-generated-secret-key-from-step-1-2
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# App Configuration
ENVIRONMENT=production
DEBUG=False

# CORS Configuration (update after frontend deployment)
CORS_ORIGINS=http://localhost:3000,https://your-vercel-app.vercel.app
```

### **2.3 Deploy Backend**
1. Railway will automatically detect Python and install dependencies
2. It will run the command from `Procfile`: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Wait for deployment to complete
4. **Copy the Railway URL** (e.g., `https://your-app.up.railway.app`)

### **2.4 Test Backend**
Visit your Railway URL in browser - you should see:
```json
{"message": "Welcome to the Football Recruitment Platform API"}
```

## ⚡ **Step 3: Deploy Frontend on Vercel**

### **3.1 Create Vercel Project**
1. Go to [vercel.com](https://vercel.com)
2. Sign up/login with GitHub
3. Click "New Project"
4. Import your GitHub repository
5. Set **Root Directory** to `frontend`
6. Framework Preset: `Create React App`

### **3.2 Configure Environment Variables**
In Vercel dashboard, go to Settings > Environment Variables:

```bash
# API Configuration
REACT_APP_API_URL=https://your-railway-app.up.railway.app
```

### **3.3 Deploy Frontend**
1. Click "Deploy"
2. Vercel will build and deploy automatically
3. **Copy the Vercel URL** (e.g., `https://your-app.vercel.app`)

### **3.4 Update Backend CORS**
Go back to Railway dashboard and update the CORS_ORIGINS variable:
```bash
CORS_ORIGINS=http://localhost:3000,https://your-app.vercel.app
```

## 🔄 **Step 4: Final Configuration**

### **4.1 Test Full Application**
1. Visit your Vercel URL
2. Try logging in
3. Test all features
4. Check browser console for errors

### **4.2 Create First Admin User**
SSH into Railway or run locally:
```bash
python backend/create_users.py
```

### **4.3 Set Up CAFC Player IDs**
1. Login as admin
2. Go to Admin panel
3. Click "🔄 Setup CAFC Player IDs"

## 📊 **Environment Variables Summary**

### **Railway (Backend) Variables:**
```bash
SNOWFLAKE_USERNAME=your_username
SNOWFLAKE_PASSWORD=your_password  
SNOWFLAKE_ACCOUNT=account.region.snowflakecomputing.com
SNOWFLAKE_WAREHOUSE=warehouse_name
SNOWFLAKE_DATABASE=database_name
SNOWFLAKE_SCHEMA=PUBLIC
SECRET_KEY=your-32-character-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
ENVIRONMENT=production
DEBUG=False
CORS_ORIGINS=http://localhost:3000,https://your-app.vercel.app
```

### **Vercel (Frontend) Variables:**
```bash
REACT_APP_API_URL=https://your-railway-app.up.railway.app
```

## 🚨 **Troubleshooting**

### **Common Issues:**

#### **Backend not responding:**
- Check Railway logs for errors
- Verify environment variables are set
- Test Snowflake connection

#### **Frontend can't connect to backend:**
- Check CORS configuration
- Verify `REACT_APP_API_URL` is correct
- Check browser network tab for errors

#### **CORS errors:**
- Update `CORS_ORIGINS` in Railway to include your Vercel URL
- Make sure no trailing slashes in URLs

#### **Authentication issues:**
- Verify `SECRET_KEY` is set in Railway
- Check JWT token expiration settings

### **Testing Checklist:**
- [ ] Backend health check responds
- [ ] Frontend loads without errors
- [ ] Login functionality works
- [ ] API calls succeed
- [ ] Admin features accessible
- [ ] No console errors

## 💰 **Cost Estimate**

### **Free Tier Usage:**
- **Vercel**: Unlimited personal projects
- **Railway**: $5/month after free trial
- **Snowflake**: Pay per usage

### **Expected Monthly Cost: ~$5-10**

## 🔄 **Auto-Deployment Setup**

Both platforms support automatic deployment:

### **Vercel (Frontend):**
- Automatically redeploys on git push to main branch
- Preview deployments for pull requests

### **Railway (Backend):**
- Automatically redeploys on git push to main branch
- Zero-downtime deployments

## 📈 **Monitoring**

### **Railway Monitoring:**
- View logs in Railway dashboard
- Monitor resource usage
- Set up alerts for downtime

### **Vercel Monitoring:**
- View deployment logs
- Monitor performance metrics
- Analytics available in dashboard

## 🎯 **Next Steps After Deployment**

1. **Test thoroughly** with real data
2. **Monitor performance** for first week  
3. **Set up backups** for Snowflake
4. **Configure custom domain** (optional)
5. **Set up monitoring alerts**

Your platform is now live and ready for users! 🎉