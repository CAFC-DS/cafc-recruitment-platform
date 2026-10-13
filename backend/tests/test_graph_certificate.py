import base64
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

import httpx
import jwt
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

from email_service import GraphEmailService
from graph_certificate import client_assertion, load_certificate


@pytest.fixture
def credential():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "unit-test")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=1))
        .sign(key, hashes.SHA256())
    )
    pfx = pkcs12.serialize_key_and_certificates(
        b"test",
        key,
        cert,
        None,
        serialization.BestAvailableEncryption(b"test-password"),
    )
    env = {
        "MS_GRAPH_TENANT_ID": "tenant",
        "MS_GRAPH_CLIENT_ID": "client",
        "MS_GRAPH_AUTH_METHOD": "certificate",
        "MS_GRAPH_CERTIFICATE_PFX_BASE64": base64.b64encode(pfx).decode(),
        "MS_GRAPH_CERTIFICATE_PASSWORD": "test-password",
    }
    return env, cert, pfx


def test_assertion_signature_claims_and_unique_id(credential):
    env, cert, _ = credential
    url = "https://login.microsoftonline.com/tenant/oauth2/v2.0/token"
    now = time.time()
    assertion = client_assertion(env, url, now)
    claims = jwt.decode(
        assertion, cert.public_key(), algorithms=["PS256"], audience=url
    )
    assert claims["iss"] == claims["sub"] == "client"
    assert claims["exp"] - claims["iat"] == 300
    assert (
        jwt.get_unverified_header(assertion)["x5t#S256"]
        == base64.urlsafe_b64encode(cert.fingerprint(hashes.SHA256()))
        .rstrip(b"=")
        .decode()
    )
    assert (
        claims["jti"]
        != jwt.decode(
            client_assertion(env, url, now),
            cert.public_key(),
            algorithms=["PS256"],
            audience=url,
        )["jti"]
    )


def test_certificate_token_cached_without_secret(credential):
    env, _, _ = credential
    env["MS_GRAPH_CLIENT_SECRET"] = "must-not-be-used"
    client = Mock()
    client.post.return_value = httpx.Response(
        200,
        json={"access_token": "test", "expires_in": 3600},
        request=httpx.Request("POST", "https://login.microsoftonline.com"),
    )
    svc = GraphEmailService(env, client=client)
    assert svc.token() == svc.token() == "test"
    assert client.post.call_count == 1
    payload = client.post.call_args.kwargs["data"]
    assert "client_secret" not in payload
    assert (
        payload["client_assertion_type"]
        == "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
    )


@pytest.mark.parametrize(
    "failure", ["password", "expired", "invalid", "missing", "ambiguous"]
)
def test_invalid_certificate_fails_closed_without_secret_fallback(credential, failure):
    env, _, _ = credential
    now = time.time()
    env["MS_GRAPH_CLIENT_SECRET"] = "fallback-secret"
    if failure == "password":
        env["MS_GRAPH_CERTIFICATE_PASSWORD"] = "wrong-password"
    if failure == "expired":
        now += 86400 * 3
    if failure == "invalid":
        env["MS_GRAPH_CERTIFICATE_PFX_BASE64"] = "invalid!"
    if failure == "missing":
        env.pop("MS_GRAPH_CERTIFICATE_PASSWORD")
    if failure == "ambiguous":
        env["MS_GRAPH_CERTIFICATE_PFX_PATH"] = "/must-not-read.pfx"
    client = Mock()
    with pytest.raises(ValueError, match="Unable to load Graph certificate"):
        GraphEmailService(env, client=client, clock=lambda: now).token()
    client.post.assert_not_called()


def test_local_pfx_file(credential, tmp_path):
    env, cert, pfx = credential
    path = tmp_path / "test.pfx"
    path.write_bytes(pfx)
    env.pop("MS_GRAPH_CERTIFICATE_PFX_BASE64")
    env["MS_GRAPH_CERTIFICATE_PFX_PATH"] = str(path)
    _, loaded = load_certificate(env)
    assert loaded.fingerprint(hashes.SHA256()) == cert.fingerprint(hashes.SHA256())
