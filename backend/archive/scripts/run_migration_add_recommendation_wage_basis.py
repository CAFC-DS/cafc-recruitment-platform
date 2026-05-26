#!/usr/bin/env python3
"""
Add the single WAGE_BASIS column to PLAYER_RECOMMENDATIONS.

Usage:
    python run_migration_add_recommendation_wage_basis.py
"""

import os
from pathlib import Path

import snowflake.connector
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from dotenv import load_dotenv


SCRIPT_DIR = Path(__file__).resolve().parent
MIGRATION_FILE = SCRIPT_DIR / "migrations" / "add_recommendation_wage_basis_columns.sql"

load_dotenv(SCRIPT_DIR / ".env")


def load_private_key():
    key_path = os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH")
    key_raw = os.getenv("SNOWFLAKE_PRIVATE_KEY")

    if key_raw:
        private_key_text = key_raw.replace("\\n", "\n").encode()
    elif key_path:
        private_key_text = (SCRIPT_DIR / key_path).read_bytes()
    else:
        return None

    private_key = serialization.load_pem_private_key(
        private_key_text,
        password=None,
        backend=default_backend(),
    )
    return private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


def get_connection():
    connect_params = {
        "account": os.getenv("SNOWFLAKE_ACCOUNT"),
        "user": os.getenv("SNOWFLAKE_USERNAME") or os.getenv("SNOWFLAKE_USER"),
        "warehouse": os.getenv("SNOWFLAKE_WAREHOUSE"),
        "database": os.getenv("SNOWFLAKE_DATABASE"),
        "schema": os.getenv("SNOWFLAKE_SCHEMA"),
    }
    private_key = load_private_key()
    if private_key:
        connect_params["private_key"] = private_key
    else:
        connect_params["password"] = os.getenv("SNOWFLAKE_PASSWORD")

    return snowflake.connector.connect(**connect_params)


def run_migration():
    statements = [
        statement.strip()
        for statement in MIGRATION_FILE.read_text().split(";")
        if statement.strip()
    ]

    print("Connecting to Snowflake...")
    conn = get_connection()
    try:
        cursor = conn.cursor()
        print(f"Executing {len(statements)} statement(s) from {MIGRATION_FILE.name}...")
        for statement in statements:
            cursor.execute(statement)
            print(f"✓ {statement}")

        cursor.execute(
            """
            SELECT COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'PLAYER_RECOMMENDATIONS'
              AND COLUMN_NAME = 'WAGE_BASIS'
            """
        )
        result = cursor.fetchone()
        if not result:
            raise RuntimeError("WAGE_BASIS column was not found after migration")

        conn.commit()
        print(f"✓ Verified {result[0]} {result[1]} on PLAYER_RECOMMENDATIONS")
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()

