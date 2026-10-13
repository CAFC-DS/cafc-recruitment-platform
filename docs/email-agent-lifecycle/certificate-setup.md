# Certificate authentication

IT supplied CAFC-PlayerRecruitment.pfx and registered its public certificate on
the existing Graph app. Reported expiry: 13 October 2028. Treat the PFX as a
private credential even though it is encrypted. Do not commit, upload to chat,
print, or copy its decrypted key to disk. The password is entered privately.

## Local check without sending

From this checkout, run in an interactive terminal:

```sh
backend/.venv/bin/python backend/tools/check_graph_certificate.py '/Users/hashim.umarji/Desktop/Private Key/CAFC-PlayerRecruitment.pfx' --authenticate
```

The password prompt is hidden. The command loads the key only in memory, reports
the public fingerprint/expiry and requests a token without sending email or
changing Snowflake. This verifies authentication, not Mail.Send scope or mailbox
restriction. The latter require coordinated tests with IT.

## Railway configuration

Target project cheerful-healing, service dependable-adventure (and the email
worker when provisioned), production environment. Stage these changes privately
before applying them. Do not accidentally include unrelated staged changes.

| Variable | Value |
| --- | --- |
| MS_GRAPH_AUTH_METHOD | certificate |
| MS_GRAPH_TENANT_ID | 4d3dd4a3-5a61-4ffc-b246-4a4f3ea15b97 |
| MS_GRAPH_CLIENT_ID | 6eff004c-36ea-49ca-ad72-f70bb498455e |
| MS_GRAPH_SENDER | playerrecruitment@cafc.co.uk |
| MS_GRAPH_CERTIFICATE_PFX_BASE64 | Base64 of the encrypted PFX, entered privately |
| MS_GRAPH_CERTIFICATE_PASSWORD | IT's PFX password, entered privately |
| EMAIL_DRY_RUN | true |
| EMAIL_LIVE_ENABLED | false |

Use Railway's sealed-variable option for the PFX and password where available.
Base64 is only encoding, not additional encryption. Configure no PFX_PATH on
Railway when using PFX_BASE64. No client secret is needed. For local files, use
PFX_PATH instead of PFX_BASE64; specifying both fails closed.

The code signs a five-minute PS256 client assertion with the certificate's
SHA-256 thumbprint. A failed certificate configuration does not fall back to a
client secret. Existing token caching and sending safeguards remain in place.

Before enabling test transport, install email tables/grants in CAFC_DB.CORE,
deploy the reviewed branch and set EMAIL_TEST_RECIPIENT / EMAIL_ALLOWLIST to
Hashim's approved inbox. Keep live disabled. Coordinate mailbox restriction
testing with IT; authentication alone does not prove the restriction.

Certificate format validation, live authentication and Railway credential setup
remain pending until the private password is supplied through the secure workflow.
Review renewal with IT before expiry; no automatic renewal task is configured.

## Railway staging — 13 October 2026

Confirmed both certificate variable names are staged on dependable-adventure,
without reading their values. Staged certificate auth, the tenant/client/sender
settings and EMAIL_DRY_RUN=true / EMAIL_LIVE_ENABLED=false. No deployment was
triggered. The service still deploys cutover/full; certificate/email code is only
in the local codex/email-agent-lifecycle branch and must be reviewed and released
before configuring transport tests.
