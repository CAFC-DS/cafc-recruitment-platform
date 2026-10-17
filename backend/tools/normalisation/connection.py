"""Explicit development connection for migration tools; never imports app startup."""
from pathlib import Path
from dotenv import dotenv_values
from cryptography.hazmat.primitives import serialization
import snowflake.connector


def connect(env_file):
    path = Path(env_file).resolve()
    env = dotenv_values(path)
    prefix = "SNOWFLAKE_DEV_"
    key_path = Path(env[prefix + "PRIVATE_KEY_PATH"]).expanduser()
    if not key_path.is_absolute():
        key_path = path.parent / key_path
    key = serialization.load_pem_private_key(key_path.read_bytes(), password=None)
    return snowflake.connector.connect(
        account=env[prefix + "ACCOUNT"], user=env[prefix + "USERNAME"],
        role=env[prefix + "ROLE"], warehouse=env[prefix + "WAREHOUSE"],
        database="CAFC_DB", schema="CORE", autocommit=True,
        private_key=key.private_bytes(serialization.Encoding.DER,
                                     serialization.PrivateFormat.PKCS8,
                                     serialization.NoEncryption()),
        login_timeout=15, network_timeout=180,
    )


def isolated_schema(name):
    import re
    if not re.fullmatch(r"CORE_DEV_CODEX_[A-Z0-9_]+", name):
        raise ValueError("Rehearsals require a new CORE_DEV_CODEX_* schema")
    return "CAFC_DB." + name
