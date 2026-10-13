"""Microsoft Graph mailbox transport. No database or application import side effects."""
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from threading import Lock
from urllib.parse import quote

import httpx
from graph_certificate import certificate_configured, client_assertion


@dataclass
class SendResult:
    status: str
    actual_recipient: str | None = None
    error: str | None = None


def valid_email(value):
    value = (value or "").strip()
    return bool(
        value
        and "@" in value
        and not any(c.isspace() or c in "\r\n,;<>" for c in value)
        and value.count("@") == 1
        and all(value.split("@"))
    )


class GraphEmailService:
    def __init__(self, env=None, client=None, sleep=time.sleep, clock=time.time):
        self.env = os.environ if env is None else env
        self.client = client or httpx.Client(timeout=30)
        self.sleep, self.clock = sleep, clock
        self._token, self._expires = None, 0
        self._lock = Lock()

    def token(self):
        with self._lock:
            if self._token and self.clock() < self._expires - 60:
                return self._token
            required = [
                "MS_GRAPH_TENANT_ID",
                "MS_GRAPH_CLIENT_ID",
            ]
            if any(not self.env.get(k) for k in required):
                raise ValueError("Microsoft Graph credentials are not configured")
            tenant = quote(self.env["MS_GRAPH_TENANT_ID"], safe="")
            token_url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
            payload = {
                "client_id": self.env["MS_GRAPH_CLIENT_ID"],
                "grant_type": "client_credentials",
                "scope": "https://graph.microsoft.com/.default",
            }
            method = self.env.get("MS_GRAPH_AUTH_METHOD") or (
                "certificate" if certificate_configured(self.env) else "client_secret"
            )
            if method == "certificate":
                payload.update(
                    {
                        "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                        "client_assertion": client_assertion(
                            self.env, token_url, self.clock()
                        ),
                    }
                )
            elif method == "client_secret" and self.env.get("MS_GRAPH_CLIENT_SECRET"):
                payload["client_secret"] = self.env["MS_GRAPH_CLIENT_SECRET"]
            else:
                raise ValueError("Microsoft Graph authentication is not configured")
            response = self.client.post(
                token_url,
                data=payload,
            )
            response.raise_for_status()
            data = response.json()
            self._token, self._expires = data["access_token"], self.clock() + int(
                data["expires_in"]
            )
            return self._token

    def send_mail(self, to, subject, html_body, mode="preview"):
        if mode not in {"preview", "test", "live"}:
            return SendResult("blocked", error="Unknown send mode")
        if not valid_email(to):
            return SendResult("blocked", error="Missing or invalid recipient address")
        if mode == "preview":
            return SendResult("preview")
        if self.env.get("EMAIL_DRY_RUN", "true").lower() != "false":
            return SendResult("blocked", error="EMAIL_DRY_RUN is enabled")
        actual = (
            self.env.get("EMAIL_TEST_RECIPIENT", "").strip()
            if mode == "test"
            else to.strip()
        )
        allowed = {
            a.strip().lower()
            for a in self.env.get("EMAIL_ALLOWLIST", "").split(",")
            if a.strip()
        }
        if not valid_email(actual) or (
            actual.lower() not in allowed
            and not (
                mode == "live"
                and self.env.get("EMAIL_LIVE_ENABLED", "false").lower() == "true"
                and not allowed
            )
        ):
            return SendResult("blocked", actual, "Recipient is not allowed")
        if (
            mode == "live"
            and self.env.get("EMAIL_LIVE_ENABLED", "false").lower() != "true"
        ):
            return SendResult("blocked", actual, "Live sending is disabled")
        sender = self.env.get("MS_GRAPH_SENDER", "playerrecruitment@cafc.co.uk")
        if sender.lower() != "playerrecruitment@cafc.co.uk":
            return SendResult(
                "blocked", actual, "Sender must be the recruitment mailbox"
            )
        payload = {
            "message": {
                "subject": ("[TEST] " if mode == "test" else "") + subject,
                "body": {"contentType": "HTML", "content": html_body},
                "toRecipients": [{"emailAddress": {"address": actual}}],
            },
            "saveToSentItems": True,
        }
        try:
            token = self.token()
        except Exception:
            return SendResult(
                "failed",
                actual,
                "Graph authentication failed; check credential configuration",
            )
        for attempt in range(4):
            try:
                response = self.client.post(
                    f'https://graph.microsoft.com/v1.0/users/{quote(sender, safe="")}/sendMail',
                    headers={"Authorization": f"Bearer {token}"},
                    json=payload,
                )
            except (httpx.TimeoutException, httpx.TransportError):
                return SendResult(
                    "uncertain",
                    actual,
                    "Transport interrupted; review mailbox before retrying",
                )
            if response.status_code == 202:
                return SendResult("accepted", actual)
            if response.status_code == 401 and attempt == 0:
                self._expires = 0
                try:
                    token = self.token()
                except Exception:
                    return SendResult(
                        "failed", actual, "Graph authentication refresh failed"
                    )
                continue
            if response.status_code == 429 or response.status_code >= 500:
                if attempt < 3:
                    delay = 2**attempt
                    retry = response.headers.get("Retry-After")
                    if retry:
                        try:
                            delay = max(0, float(retry))
                        except ValueError:
                            try:
                                delay = max(
                                    0,
                                    (
                                        parsedate_to_datetime(retry)
                                        - datetime.now(timezone.utc)
                                    ).total_seconds(),
                                )
                            except (ValueError, TypeError):
                                pass
                    if delay > 60:
                        return SendResult(
                            "failed",
                            actual,
                            f"Graph throttled; retry after {int(delay)} seconds",
                        )
                    self.sleep(delay)
                    continue
            return SendResult(
                "failed", actual, f"Graph returned HTTP {response.status_code}"
            )
        return SendResult("failed", actual, "Graph retry limit reached")
