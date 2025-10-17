#!/usr/bin/env python3
"""Check user roles in development database"""
import os
from dotenv import load_dotenv
import snowflake.connector

# Load from backend directory
import sys
sys.path.insert(0, os.path.dirname(__file__))
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

conn = snowflake.connector.connect(
    user=os.getenv("SNOWFLAKE_USERNAME"),
    password=os.getenv("SNOWFLAKE_PASSWORD"),
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
    database=os.getenv("SNOWFLAKE_DATABASE"),
    schema=os.getenv("SNOWFLAKE_SCHEMA"),
)

cursor = conn.cursor()

print("\n" + "=" * 80)
print("CHECKING USER ROLES IN DEVELOPMENT DATABASE")
print("=" * 80 + "\n")

# Check all users
cursor.execute("""
    SELECT ID, USERNAME, FIRSTNAME, LASTNAME, ROLE, EMAIL
    FROM users
    ORDER BY ROLE, USERNAME
""")

users = cursor.fetchall()

role_counts = {}
for user in users:
    user_id, username, firstname, lastname, role, email = user
    role_counts[role] = role_counts.get(role, 0) + 1

    # Highlight Dave Huzzey and Tom Pell
    is_target = (
        'dave' in (username or '').lower() or
        'tom' in (username or '').lower() or
        'huzzey' in (lastname or '').lower() or
        'pell' in (lastname or '').lower()
    )

    marker = ">>> " if is_target else "    "

    print(f"{marker}[{role.upper()}] {firstname} {lastname} (@{username})")
    if is_target:
        print(f"    ^^^ FOUND: This user should probably be 'manager' or 'admin' in production")
        print()

print("\n" + "=" * 80)
print("ROLE SUMMARY:")
print("=" * 80)
for role, count in sorted(role_counts.items()):
    print(f"  {role}: {count} users")

print("\n" + "=" * 80)
print("ROLE PERMISSIONS:")
print("=" * 80)
print("  scout    - Can ONLY see their own reports")
print("  loan     - Can see their own reports + all Loan Reports")
print("  manager  - Can see ALL reports")
print("  admin    - Can see ALL reports + manage users")
print("\n")

cursor.close()
conn.close()
