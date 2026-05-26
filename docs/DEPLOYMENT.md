# 🚀 Recruitment Platform Deployment Guide

## 🔒 Security First - CRITICAL FIXES

### 1. Secure Environment Variables
```bash
# Copy the example env file
cp backend/.env.example backend/.env

# Edit with your actual credentials
nano backend/.env
```

**NEVER commit the actual .env file to git!**

### 2. Generate Secure JWT Secret
```bash
# Generate a secure JWT secret (32+ characters)
openssl rand -hex 32
```

## 🛠 Production Deployment

### Option 1: Docker Deployment (Recommended)

#### 1. Create Dockerfile for Backend
```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### 2. Create Dockerfile for Frontend
```dockerfile
# frontend/Dockerfile
FROM node:18-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### 3. Docker Compose
```yaml
# docker-compose.yml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
    volumes:
      - ./backend/.env:/app/.env

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
```

### Option 2: VPS/Server Deployment

#### Backend Setup
```bash
# 1. Setup Python environment
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate     # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run with Gunicorn (production WSGI server)
pip install gunicorn
gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8000
```

#### Frontend Setup
```bash
# 1. Install dependencies and build
npm install
npm run build

# 2. Serve with Nginx
sudo cp -r build/* /var/www/html/
sudo systemctl restart nginx
```

### Option 3: Cloud Deployment (AWS/Heroku/Vercel)

#### Heroku Deployment
```bash
# 1. Install Heroku CLI and login
heroku login

# 2. Create apps
heroku create your-app-backend
heroku create your-app-frontend

# 3. Set environment variables
heroku config:set JWT_SECRET_KEY="your-secret" -a your-app-backend
heroku config:set DATABASE_URL="your-db-url" -a your-app-backend

# 4. Deploy
git push heroku main
```

## 👥 Account Creation

### Method 1: Direct Database Insert
```sql
-- Connect to your Snowflake database
USE DATABASE recruitment_platform;
USE SCHEMA public;

-- Create admin user (replace with your details)
INSERT INTO users (username, email, hashed_password, role, is_active)
VALUES (
    'admin',
    'admin@charltonathletic.com',
    '$2b$12$YourHashedPasswordHere',  -- Use bcrypt to hash
    'admin',
    TRUE
);

-- Create scout user
INSERT INTO users (username, email, hashed_password, role, is_active)
VALUES (
    'scout1',
    'scout1@charltonathletic.com',
    '$2b$12$YourHashedPasswordHere',
    'scout',
    TRUE
);
```

### Method 2: Python Script (Recommended)
```python
# create_users.py
from passlib.context import CryptContext
import os

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str):
    return pwd_context.hash(password)

# Generate hashed passwords
admin_password = hash_password("your_secure_admin_password")
scout_password = hash_password("your_secure_scout_password")

print(f"Admin password hash: {admin_password}")
print(f"Scout password hash: {scout_password}")
```

### Method 3: API Endpoint (Create registration endpoint)
```python
# Add to main.py temporarily for setup
@app.post("/setup/create-admin")
async def create_admin_user():
    # Only allow this once, then remove the endpoint
    pass
```

## 🗄 Database Setup

### 1. Snowflake Configuration
```sql
-- Create database and schema
CREATE DATABASE recruitment_platform;
USE DATABASE recruitment_platform;
CREATE SCHEMA public;

-- Run your existing table creation scripts
-- Make sure all tables exist before deployment
```

### 2. Environment Variables
```env
DATABASE_URL=snowflake://user:password@account/database/schema
JWT_SECRET_KEY=your_very_long_secure_secret_key_here
ACCESS_TOKEN_EXPIRE_MINUTES=30
DEBUG=False
ENVIRONMENT=production
```

## 🔐 Security Checklist

- [ ] .env file not in git
- [ ] Strong JWT secret (32+ characters)
- [ ] HTTPS enabled
- [ ] Database credentials secured
- [ ] CORS configured properly
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention
- [ ] Remove debug logs

## 🚦 Production Startup

### Backend
```bash
# Production startup command
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Frontend
```bash
# Build and serve
npm run build
# Serve with a static server (nginx, Apache, etc.)
```

## 📋 Post-Deployment Checklist

1. ✅ Test login functionality
2. ✅ Create initial admin account
3. ✅ Test scout report creation
4. ✅ Test intel report creation
5. ✅ Verify role-based permissions
6. ✅ Test data filtering
7. ✅ Check all forms work
8. ✅ Verify database connections
9. ✅ Test export functionality
10. ✅ Monitor logs for errors

## 🆘 Troubleshooting

### Common Issues:
- **CORS errors**: Check allowed origins in backend
- **Database connection**: Verify Snowflake credentials
- **JWT errors**: Ensure secret key is set
- **Build failures**: Check Node.js version (use 18+)

## 📞 Support
For deployment issues, check logs:
- Backend: Check uvicorn/gunicorn logs
- Frontend: Check browser console
- Database: Check Snowflake query history