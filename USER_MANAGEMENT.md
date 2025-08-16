# Admin-Only User Management & Password Reset Guide

## Overview
This system implements admin-only user creation with self-service password management. Only administrators can create users, but users can reset their own passwords on the login page.

### 1. Email Column Added to Users
- All user models now include an email field
- Email is required when admin creates users
- Emails must be unique across the platform

### 2. Password Management

#### Reset Password (No Authentication Required)
Users can reset their password on the login page by providing their username and email:
```bash
POST /reset-password
{
  "username": "their_username",
  "email": "their_email@example.com", 
  "new_password": "new_secure_password"
}
```

#### Change Password (Authenticated Users)
Logged-in users can change their password:
```bash
POST /change-password
{
  "current_password": "old_password",
  "new_password": "new_secure_password"
}
```

### 3. Admin User Management

#### View All Users (Admin Only)
```bash
GET /admin/users
```

#### Create New User (Admin Only)
```bash
POST /admin/users
{
  "username": "new_scout",
  "email": "scout@example.com",
  "password": "secure_password",
  "role": "scout"  // admin, scout, manager
}
```

#### Delete User (Admin Only)
```bash
DELETE /admin/users/{user_id}
```

#### Update User Role (Admin Only)
```bash
PUT /admin/users/{user_id}/role?new_role=manager
```

#### Reset User Password (Admin Only)
```bash
POST /admin/users/{user_id}/reset-password?new_password=temp_password
```

## Using the create_users.py Script

The `create_users.py` script has been updated to work with the new email column:

```bash
cd backend
python create_users.py
```

This script will:
1. Automatically add the EMAIL column to the users table if it doesn't exist
2. Prompt you to create an admin user with email
3. Optionally create scout accounts with emails

## Admin User Creation Methods

### Option 1: Using the Script (Recommended for Initial Setup)
```bash
python backend/create_users.py
```
This script will create the first admin user and optionally create scout accounts.

### Option 2: Using the Admin API (For Ongoing Management)
1. Login as an admin user to get a JWT token
2. Use the `/admin/users` endpoint to create new users
3. Assign appropriate roles (admin, scout, manager)

**Note**: Public registration has been removed for security. Only administrators can create new user accounts.

## Security Features

- **Password Hashing**: All passwords are hashed using bcrypt
- **JWT Tokens**: Secure authentication with configurable expiration
- **Role-Based Access**: Admin endpoints protected by role checking
- **Email Validation**: Prevents duplicate email addresses
- **Username/Email Verification**: Password reset requires both username and email to match
- **Admin-Only User Creation**: Public registration removed for security
- **Self-Protection**: Admins cannot delete themselves or change their own role

## User Workflow

### For New Users (Created by Admin):
1. Admin creates user account with username, email, password, and role
2. User receives login credentials from admin
3. User can immediately login with provided credentials
4. User can optionally change password after first login using `/change-password`

### For Password Reset (On Login Page):
1. User clicks "Forgot Password" on login page
2. User enters their username and email address
3. User enters their new desired password
4. System verifies username and email match
5. Password is immediately updated
6. User can login with new password

## Database Migration

The system automatically handles the database migration:
- When a user registers or an admin creates a user, the EMAIL column is added if it doesn't exist
- Existing users without emails will show "No email" until updated
- No manual database changes required

## Testing the Implementation

1. **Start the backend**: `python backend/main.py`
2. **Create an admin user**: `python backend/create_users.py`
3. **Test the endpoints** using the FastAPI docs at `http://localhost:8000/docs`

## API Authentication

All admin endpoints require authentication:
1. Login to get a JWT token: `POST /token`
2. Include the token in the Authorization header: `Bearer {token}`
3. Admin endpoints will verify the user's role before allowing access