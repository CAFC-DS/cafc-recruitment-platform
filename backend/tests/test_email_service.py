import sys
from pathlib import Path
from unittest.mock import Mock
import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from email_service import GraphEmailService

ENV = {
    "MS_GRAPH_TENANT_ID": "tenant",
    "MS_GRAPH_CLIENT_ID": "client",
    "MS_GRAPH_CLIENT_SECRET": "secret",
    "EMAIL_DRY_RUN": "false",
    "EMAIL_ALLOWLIST": "test@example.com",
    "EMAIL_TEST_RECIPIENT": "test@example.com",
    "EMAIL_LIVE_ENABLED": "true",
}


def response(status=202, headers=None, data=None):
    return httpx.Response(
        status,
        headers=headers or {},
        json=data,
        request=httpx.Request("POST", "https://graph.microsoft.com"),
    )


def service(responses, env=None):
    client = Mock()
    client.post.side_effect = responses
    return (
        GraphEmailService(
            ENV if env is None else env,
            client=client,
            sleep=Mock(),
            clock=Mock(return_value=100),
        ),
        client,
    )


def test_token_cached_and_refreshed():
    svc, client = service(
        [
            response(200, data={"access_token": "a", "expires_in": 3600}),
            response(200, data={"access_token": "b", "expires_in": 3600}),
        ]
    )
    assert svc.token() == svc.token() == "a"
    assert client.post.call_count == 1
    svc.clock.return_value = 3641
    assert svc.token() == "b"


def test_test_send_redirects_single_recipient_and_saves_sent_items():
    svc, client = service(
        [response(200, data={"access_token": "a", "expires_in": 3600}), response()]
    )
    result = svc.send_mail("agent@example.com", "Subject", "<p>hello</p>", mode="test")
    assert result.status == "accepted"
    assert result.actual_recipient == "test@example.com"
    args = client.post.call_args
    assert "/v1.0/users/playerrecruitment%40cafc.co.uk/sendMail" in args.args[0]
    payload = args.kwargs["json"]
    assert payload["saveToSentItems"] is True
    assert payload["message"]["toRecipients"] == [
        {"emailAddress": {"address": "test@example.com"}}
    ]
    assert (
        "ccRecipients" not in payload["message"]
        and "bccRecipients" not in payload["message"]
    )
    assert payload["message"]["subject"].startswith("[TEST]")


@pytest.mark.parametrize("status", [429, 503])
def test_bounded_retry_honours_retry_after(status):
    svc, client = service(
        [
            response(200, data={"access_token": "a", "expires_in": 3600}),
            response(status, {"Retry-After": "3"}),
            response(),
        ]
    )
    assert svc.send_mail("test@example.com", "s", "h", "live").status == "accepted"
    svc.sleep.assert_called_once_with(3)


def test_long_throttling_fails_without_blocking_worker():
    svc, client = service(
        [
            response(200, data={"access_token": "a", "expires_in": 3600}),
            response(429, {"Retry-After": "120"}),
        ]
    )
    assert svc.send_mail("test@example.com", "s", "h", "live").status == "failed"
    svc.sleep.assert_not_called()


@pytest.mark.parametrize(
    "mode,env,to,status",
    [
        ("preview", {}, "agent@example.com", "preview"),
        ("live", ENV, "other@example.com", "blocked"),
        ("live", {**ENV, "EMAIL_DRY_RUN": "true"}, "test@example.com", "blocked"),
        ("live", {**ENV, "EMAIL_LIVE_ENABLED": "false"}, "test@example.com", "blocked"),
        ("test", {**ENV, "EMAIL_ALLOWLIST": ""}, "agent@example.com", "blocked"),
        (
            "live",
            {**ENV, "MS_GRAPH_SENDER": "other@example.com"},
            "test@example.com",
            "blocked",
        ),
        ("live", ENV, "a@example.com,b@example.com", "blocked"),
    ],
)
def test_safety_blocks_before_network(mode, env, to, status):
    svc, client = service([], env)
    assert svc.send_mail(to, "s", "h", mode).status == status
    client.post.assert_not_called()


def test_transport_timeout_is_uncertain_without_retry():
    svc, client = service(
        [
            response(200, data={"access_token": "a", "expires_in": 3600}),
            httpx.ReadTimeout("timeout"),
        ]
    )
    assert svc.send_mail("test@example.com", "s", "h", "live").status == "uncertain"
    assert client.post.call_count == 2
    svc.sleep.assert_not_called()


def test_missing_credential_is_sanitised():
    svc, client = service([], {**ENV, "MS_GRAPH_CLIENT_SECRET": ""})
    result = svc.send_mail("test@example.com", "s", "h", "live")
    assert result.status == "failed"
    assert "secret" not in (result.error or "")
    client.post.assert_not_called()
