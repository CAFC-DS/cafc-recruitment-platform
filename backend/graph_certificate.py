"""Encrypted PFX authentication; private keys are decrypted only in memory."""
import base64
import time
import uuid
from pathlib import Path

import jwt
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12


def certificate_configured(env):
    return bool(
        env.get("MS_GRAPH_CERTIFICATE_PFX_BASE64")
        or env.get("MS_GRAPH_CERTIFICATE_PFX_PATH")
    )


def load_certificate(env, now=None):
    try:
        encoded = env.get("MS_GRAPH_CERTIFICATE_PFX_BASE64")
        path = env.get("MS_GRAPH_CERTIFICATE_PFX_PATH")
        if bool(encoded) == bool(path):
            raise ValueError("Specify exactly one PFX source")
        password = env.get("MS_GRAPH_CERTIFICATE_PASSWORD")
        if not password:
            raise ValueError("PFX password is required")
        data = (
            base64.b64decode(encoded, validate=True)
            if encoded
            else Path(path).read_bytes()
        )
        key, cert, _ = pkcs12.load_key_and_certificates(data, password.encode("utf-8"))
        if (
            not isinstance(key, rsa.RSAPrivateKey)
            or cert is None
            or key.key_size < 2048
        ):
            raise ValueError("An RSA certificate and private key are required")
        if key.public_key().public_numbers() != cert.public_key().public_numbers():
            raise ValueError("Certificate and key do not match")
        current = time.time() if now is None else now
        if (
            not cert.not_valid_before_utc.timestamp()
            <= current
            < cert.not_valid_after_utc.timestamp()
        ):
            raise ValueError("Certificate is expired or not yet valid")
        return key, cert
    except Exception:
        # Never surface library errors containing credential material or paths.
        raise ValueError(
            "Unable to load Graph certificate: check PFX source, password, validity and RSA key"
        ) from None


def client_assertion(env, token_url, now):
    key, cert = load_certificate(env, now)
    thumbprint = (
        base64.urlsafe_b64encode(cert.fingerprint(hashes.SHA256()))
        .rstrip(b"=")
        .decode("ascii")
    )
    client_id = env["MS_GRAPH_CLIENT_ID"]
    issued = int(now)
    return jwt.encode(
        {
            "aud": token_url,
            "iss": client_id,
            "sub": client_id,
            "jti": str(uuid.uuid4()),
            "iat": issued,
            "nbf": issued,
            "exp": issued + 300,
        },
        key,
        algorithm="PS256",
        headers={"x5t#S256": thumbprint},
    )
