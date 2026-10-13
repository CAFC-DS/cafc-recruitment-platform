"""Check the PFX and optionally obtain a Graph token. Never sends email or prints secrets."""
import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from graph_certificate import load_certificate
from email_service import GraphEmailService
from cryptography.hazmat.primitives import hashes


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pfx", help="Path to IT's encrypted PFX")
    parser.add_argument(
        "--authenticate",
        action="store_true",
        help="Request a token; does not send email",
    )
    args = parser.parse_args()
    if not sys.stdin.isatty():
        raise SystemExit("Run in an interactive terminal so the password stays hidden")
    env = {
        "MS_GRAPH_AUTH_METHOD": "certificate",
        "MS_GRAPH_TENANT_ID": "4d3dd4a3-5a61-4ffc-b246-4a4f3ea15b97",
        "MS_GRAPH_CLIENT_ID": "6eff004c-36ea-49ca-ad72-f70bb498455e",
        "MS_GRAPH_CERTIFICATE_PFX_PATH": args.pfx,
        "MS_GRAPH_CERTIFICATE_PASSWORD": getpass.getpass("PFX password (hidden): "),
    }
    try:
        _, cert = load_certificate(env)
        print("Certificate loaded successfully")
        print("Expiry:", cert.not_valid_after_utc.isoformat())
        print("SHA-256 fingerprint:", cert.fingerprint(hashes.SHA256()).hex())
        if args.authenticate:
            GraphEmailService(env).token()
            print("Microsoft Graph authentication succeeded. No email sent.")
    except Exception:
        raise SystemExit(
            "Certificate check failed. Check the password, certificate registration and network access; no credential details were printed."
        ) from None
    finally:
        env.clear()


if __name__ == "__main__":
    run()
