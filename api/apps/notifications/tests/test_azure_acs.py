"""Payload translation for the Azure ACS email backend.

The network call is Azure's problem; turning a Django EmailMessage into the
right JSON is ours, and it is where the bugs live. All of this runs without
credentials.
"""

import base64

import pytest
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import EmailMessage, EmailMultiAlternatives

from apps.notifications.backends.azure_acs import (
    AzureCommunicationEmailBackend,
    build_acs_message,
)

SENDER = "noreply@luma.de"


def test_plain_text_message():
    message = EmailMessage(
        subject="123456 — your Luma code",
        body="Your sign-in code:\n\n    123456\n",
        to=["host@example.com"],
    )

    payload = build_acs_message(message, SENDER)

    assert payload["senderAddress"] == SENDER
    assert payload["recipients"]["to"] == [{"address": "host@example.com"}]
    assert payload["content"]["subject"] == "123456 — your Luma code"
    assert "123456" in payload["content"]["plainText"]
    assert "html" not in payload["content"]


def test_display_name_is_split_out_of_recipients():
    message = EmailMessage(subject="s", body="b", to=["Christoph Wölfle <christoph@example.com>"])

    payload = build_acs_message(message, SENDER)

    assert payload["recipients"]["to"] == [
        {"address": "christoph@example.com", "displayName": "Christoph Wölfle"}
    ]


def test_sender_display_name_is_stripped():
    """ACS rejects a display name in senderAddress with a 400."""
    message = EmailMessage(
        subject="s", body="b", to=["a@example.com"], from_email="Luma <hi@luma.de>"
    )

    payload = build_acs_message(message, SENDER)

    assert payload["senderAddress"] == "hi@luma.de"


def test_configured_acs_sender_wins_over_djangos_default():
    """Django fills from_email with DEFAULT_FROM_EMAIL when nobody set one.

    Treating that as an explicit choice would send as an address ACS has not
    verified, and every message would 400.
    """
    message = EmailMessage(subject="s", body="b", to=["a@example.com"])
    assert message.from_email == settings.DEFAULT_FROM_EMAIL  # Django's doing

    payload = build_acs_message(message, SENDER)

    assert payload["senderAddress"] == SENDER


def test_an_explicitly_different_sender_is_still_honoured():
    message = EmailMessage(
        subject="s", body="b", to=["a@example.com"], from_email="support@luma.de"
    )

    payload = build_acs_message(message, SENDER)

    assert payload["senderAddress"] == "support@luma.de"


def test_html_alternative_is_carried_across():
    message = EmailMultiAlternatives(subject="s", body="plain version", to=["a@example.com"])
    message.attach_alternative("<p>html version</p>", "text/html")

    payload = build_acs_message(message, SENDER)

    assert payload["content"]["plainText"] == "plain version"
    assert payload["content"]["html"] == "<p>html version</p>"


def test_html_only_message():
    message = EmailMessage(subject="s", body="<p>hi</p>", to=["a@example.com"])
    message.content_subtype = "html"

    payload = build_acs_message(message, SENDER)

    assert payload["content"]["html"] == "<p>hi</p>"
    assert "plainText" not in payload["content"]


def test_cc_bcc_and_reply_to():
    message = EmailMessage(
        subject="s",
        body="b",
        to=["a@example.com"],
        cc=["c@example.com"],
        bcc=["b@example.com"],
        reply_to=["support@luma.de"],
    )

    payload = build_acs_message(message, SENDER)

    assert payload["recipients"]["cc"] == [{"address": "c@example.com"}]
    assert payload["recipients"]["bcc"] == [{"address": "b@example.com"}]
    assert payload["replyTo"] == [{"address": "support@luma.de"}]


def test_attachments_are_translated_not_dropped():
    """Silently losing an attachment is a bug that only shows in production."""
    message = EmailMessage(subject="s", body="b", to=["a@example.com"])
    message.attach("album.zip", b"PK\x03\x04binary", "application/zip")

    payload = build_acs_message(message, SENDER)

    attachment = payload["attachments"][0]
    assert attachment["name"] == "album.zip"
    assert attachment["contentType"] == "application/zip"
    assert base64.b64decode(attachment["contentInBase64"]) == b"PK\x03\x04binary"


def test_message_with_no_recipients_is_rejected():
    message = EmailMessage(subject="s", body="b", to=[])

    with pytest.raises(ValueError, match="no recipients"):
        build_acs_message(message, SENDER)


def test_from_header_is_not_duplicated_into_headers():
    """Django puts From into extra_headers; ACS takes it as senderAddress."""
    message = EmailMessage(
        subject="s",
        body="b",
        to=["a@example.com"],
        headers={"From": "spoof@elsewhere.com", "X-Luma-Event": "LUMA01"},
    )

    payload = build_acs_message(message, SENDER)

    assert "From" not in payload.get("headers", {})
    assert payload["headers"]["X-Luma-Event"] == "LUMA01"


# --- Backend wiring --------------------------------------------------------


ACS_SETTINGS = {
    "EMAIL_BACKEND": "apps.notifications.backends.azure_acs.AzureCommunicationEmailBackend",
    "AZURE_ACS_ENDPOINT": "https://luma.communication.azure.com",
    "AZURE_ACS_ACCESS_KEY": "test-key",
    "AZURE_ACS_SENDER": SENDER,
}


class FakePoller:
    def result(self):
        return {"id": "op-1", "status": "Succeeded"}


class FakeClient:
    def __init__(self):
        self.sent = []

    def begin_send(self, payload):
        self.sent.append(payload)
        return FakePoller()


def test_backend_requires_credentials(settings):
    settings.AZURE_ACS_CONNECTION_STRING = ""
    settings.AZURE_ACS_ENDPOINT = ""
    settings.AZURE_ACS_ACCESS_KEY = ""
    settings.AZURE_ACS_SENDER = SENDER

    with pytest.raises(ImproperlyConfigured, match="AZURE_ACS_CONNECTION_STRING"):
        AzureCommunicationEmailBackend()


def test_backend_requires_a_sender(settings):
    settings.AZURE_ACS_CONNECTION_STRING = ""
    settings.AZURE_ACS_ENDPOINT = ACS_SETTINGS["AZURE_ACS_ENDPOINT"]
    settings.AZURE_ACS_ACCESS_KEY = "k"
    settings.AZURE_ACS_SENDER = ""
    settings.DEFAULT_FROM_EMAIL = ""

    with pytest.raises(ImproperlyConfigured, match="AZURE_ACS_SENDER"):
        AzureCommunicationEmailBackend()


def test_send_messages_submits_each_message(settings, monkeypatch):
    for key, value in ACS_SETTINGS.items():
        setattr(settings, key, value)
    settings.AZURE_ACS_CONNECTION_STRING = ""

    backend = AzureCommunicationEmailBackend()
    fake = FakeClient()
    monkeypatch.setattr(backend, "_get_client", lambda: fake)

    sent = backend.send_messages(
        [
            EmailMessage(subject="one", body="b", to=["a@example.com"]),
            EmailMessage(subject="two", body="b", to=["b@example.com"]),
        ]
    )

    assert sent == 2
    assert [p["content"]["subject"] for p in fake.sent] == ["one", "two"]
    assert fake.sent[0]["senderAddress"] == SENDER


def test_failures_propagate_unless_fail_silently(settings, monkeypatch):
    for key, value in ACS_SETTINGS.items():
        setattr(settings, key, value)
    settings.AZURE_ACS_CONNECTION_STRING = ""

    class Exploding:
        def begin_send(self, payload):
            raise RuntimeError("ACS said no")

    message = EmailMessage(subject="s", body="b", to=["a@example.com"])

    loud = AzureCommunicationEmailBackend()
    monkeypatch.setattr(loud, "_get_client", lambda: Exploding())
    with pytest.raises(RuntimeError):
        loud.send_messages([message])

    quiet = AzureCommunicationEmailBackend(fail_silently=True)
    monkeypatch.setattr(quiet, "_get_client", lambda: Exploding())
    assert quiet.send_messages([message]) == 0


# --- Language --------------------------------------------------------------


@pytest.mark.django_db
def test_login_code_email_is_german_when_asked(client):
    """DESIGN.md §10 — German is written, not translated, and informal."""
    from django.core import mail

    response = client.post(
        "/api/auth/request-code",
        {"email": "gast@example.com", "language": "de"},
        content_type="application/json",
    )
    assert response.status_code == 200

    message = mail.outbox[0]
    assert "dein Luma-Code" in message.subject
    assert "Anmeldecode" in message.body
    # Informal address throughout.
    assert "Dein" in message.body
    assert "Ihr" not in message.body


@pytest.mark.django_db
def test_accept_language_header_picks_german(client):
    from django.core import mail

    client.post(
        "/api/auth/request-code",
        {"email": "gast2@example.com"},
        content_type="application/json",
        headers={"Accept-Language": "de-DE,de;q=0.9,en;q=0.8"},
    )
    assert "dein Luma-Code" in mail.outbox[0].subject


@pytest.mark.django_db
def test_english_is_the_default(client):
    from django.core import mail

    client.post(
        "/api/auth/request-code",
        {"email": "guest3@example.com"},
        content_type="application/json",
    )
    assert "your Luma code" in mail.outbox[0].subject
