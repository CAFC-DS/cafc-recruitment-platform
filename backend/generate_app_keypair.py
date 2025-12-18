#!/usr/bin/env python3
"""
Generate RSA Key-Pair for Snowflake APP_USER Authentication

This script generates a new RSA key-pair for the APP_USER Snowflake account.
The private key will be used by the application to authenticate, and the
public key must be registered with Snowflake using the ALTER USER command.

Usage:
    python generate_app_keypair.py

Output:
    - Private key: ./keys/app_user_rsa_key.pem
    - Public key: ./keys/app_user_rsa_key.pub
    - SQL command to register the public key with APP_USER
"""

import os
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend


def generate_rsa_keypair():
    """Generate a new RSA key-pair for Snowflake authentication"""

    print("=" * 80)
    print("Snowflake RSA Key-Pair Generator for APP_USER")
    print("=" * 80)
    print()

    # Create keys directory if it doesn't exist
    keys_dir = os.path.join(os.path.dirname(__file__), "keys")
    os.makedirs(keys_dir, exist_ok=True)

    # Define file paths
    private_key_path = os.path.join(keys_dir, "app_user_rsa_key.pem")
    public_key_path = os.path.join(keys_dir, "app_user_rsa_key.pub")

    # Check if keys already exist
    if os.path.exists(private_key_path) or os.path.exists(public_key_path):
        print("WARNING: Key files already exist!")
        print(f"  - {private_key_path}")
        print(f"  - {public_key_path}")
        print()
        response = input("Do you want to OVERWRITE the existing keys? (yes/no): ")
        if response.lower() not in ["yes", "y"]:
            print("\nAborted. Existing keys preserved.")
            return
        print()

    print("Step 1: Generating 2048-bit RSA key-pair...")

    # Generate private key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )

    # Serialize private key to PEM format (unencrypted)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )

    # Extract public key
    public_key = private_key.public_key()

    # Serialize public key to PEM format
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )

    print("✓ Key-pair generated successfully")
    print()

    # Save private key
    print(f"Step 2: Saving private key to {private_key_path}...")
    with open(private_key_path, "wb") as f:
        f.write(private_pem)
    os.chmod(private_key_path, 0o600)  # Restrict permissions
    print("✓ Private key saved (permissions set to 600)")
    print()

    # Save public key
    print(f"Step 3: Saving public key to {public_key_path}...")
    with open(public_key_path, "wb") as f:
        f.write(public_pem)
    print("✓ Public key saved")
    print()

    # Format public key for Snowflake
    public_key_str = public_pem.decode("utf-8")
    # Remove header, footer, and newlines for Snowflake
    public_key_oneline = public_key_str.replace("-----BEGIN PUBLIC KEY-----", "") \
                                       .replace("-----END PUBLIC KEY-----", "") \
                                       .replace("\n", "")

    print("=" * 80)
    print("SUCCESS! Key-pair generated.")
    print("=" * 80)
    print()
    print("📁 Files Created:")
    print(f"   Private Key: {private_key_path}")
    print(f"   Public Key:  {public_key_path}")
    print()
    print("=" * 80)
    print("NEXT STEPS - Register Public Key with Snowflake")
    print("=" * 80)
    print()
    print("1. Log into Snowflake with an account that has ACCOUNTADMIN privileges")
    print()
    print("2. Run the following SQL command to register the public key with APP_USER:")
    print()
    print("-" * 80)
    print(f"ALTER USER APP_USER SET RSA_PUBLIC_KEY='{public_key_oneline}';")
    print("-" * 80)
    print()
    print("3. Verify the key was registered successfully:")
    print()
    print("   DESC USER APP_USER;")
    print()
    print("   Look for the RSA_PUBLIC_KEY_FP (fingerprint) field to confirm.")
    print()
    print("4. Ensure APP_USER has the necessary permissions:")
    print()
    print("   GRANT ROLE APP_ROLE TO USER APP_USER;")
    print("   GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE APP_ROLE;")
    print("   GRANT USAGE ON DATABASE RECRUITMENT_TEST TO ROLE APP_ROLE;")
    print("   GRANT USAGE ON SCHEMA RECRUITMENT_TEST.PUBLIC TO ROLE APP_ROLE;")
    print("   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA RECRUITMENT_TEST.PUBLIC TO ROLE APP_ROLE;")
    print("   GRANT SELECT, INSERT, UPDATE, DELETE ON FUTURE TABLES IN SCHEMA RECRUITMENT_TEST.PUBLIC TO ROLE APP_ROLE;")
    print()
    print("5. Update your .env file:")
    print()
    print("   SNOWFLAKE_PROD_USERNAME=APP_USER")
    print("   SNOWFLAKE_PROD_ROLE=APP_ROLE")
    print("   SNOWFLAKE_PROD_WAREHOUSE=COMPUTE_WH")
    print(f"   SNOWFLAKE_PROD_PRIVATE_KEY_PATH={private_key_path}")
    print()
    print("6. For production deployment (Railway), set the environment variable:")
    print()
    print("   SNOWFLAKE_PRIVATE_KEY=<paste contents of app_user_rsa_key.pem>")
    print()
    print("=" * 80)
    print()
    print("⚠️  IMPORTANT SECURITY NOTES:")
    print("   - Keep the private key file SECURE and NEVER commit it to git")
    print("   - The private key has been added to .gitignore")
    print("   - Only share the PUBLIC key with Snowflake")
    print("   - Rotate keys periodically for security")
    print()
    print("=" * 80)
    print()


if __name__ == "__main__":
    try:
        generate_rsa_keypair()
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        print("\nKey generation failed. Please check the error message above.")
        exit(1)
