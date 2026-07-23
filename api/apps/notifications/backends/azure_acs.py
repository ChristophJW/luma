"""Django email backend for Azure Communication Services Email.

Selected with:

    EMAIL_BACKEND=apps.notifications.backends.azure_acs.AzureCommunicationEmailBackend

Local development stays on Mailpit; this is only used where real delivery is
wanted. The Azure SDK is an optional dependency (`uv sync --extra azure`) so a
local checkout does not need it.

Notes on behaviour:

* The ACS send API is long-running. `begin_send()` submits the message and
  returns a poller. By default this backend does **not** block on delivery —
  sign-in mail is sent inside a request, and a code that takes 40 seconds
  "feels broken no matter how good the screen is" (CONCEPT.md §4). Set
  AZURE_ACS_WAIT_FOR_SEND=true if you need the operation id.
* Submission errors still raise immediately, so a misconfigured sender or a
  rejected recipient is not silently swallowed.
"""

from __future__ import annotations

import base64
import logging
from typing import Any

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail.backends.base import BaseEmailBackend
from django.core.mail.message import EmailMessage, EmailMultiAlternatives

logger = logging.getLogger(__name__)


def _address(value: str) -> dict[str, str]:
    """Split "Display Name <a@b.c>" into the shape ACS expects."""
    from email.utils import parseaddr

    display_name, address = parseaddr(value)
    entry = {"address": address or value}
    if display_name:
        entry["displayName"] = display_name
    return entry


def resolve_sender(message: EmailMessage, acs_sender: str) -> str:
    """Decide which address to send as.

    ACS rejects any sender that is not verified on a domain provisioned in the
    resource, so the configured AZURE_ACS_SENDER has to win by default.

    Django fills `from_email` with DEFAULT_FROM_EMAIL whenever a caller did not
    set one, which means `message.from_email or ...` would never fall through.
    So: an explicitly different from_email is honoured, and the Django default
    is treated as "unset".
    """
    from_email = message.from_email or ""
    if from_email and from_email != settings.DEFAULT_FROM_EMAIL:
        return from_email
    return acs_sender or from_email


def build_acs_message(message: EmailMessage, default_sender: str) -> dict[str, Any]:
    """Translate a Django EmailMessage into an ACS payload.

    Side-effect free apart from reading settings, so it can be tested without
    credentials or a network call — which is where most of the risk sits.
    """
    # ACS takes the bare address as senderAddress; a display name is not
    # accepted there and causes a 400.
    sender_address = _address(resolve_sender(message, default_sender))["address"]

    recipients: dict[str, list[dict[str, str]]] = {}
    if message.to:
        recipients["to"] = [_address(value) for value in message.to]
    if message.cc:
        recipients["cc"] = [_address(value) for value in message.cc]
    if message.bcc:
        recipients["bcc"] = [_address(value) for value in message.bcc]

    if not recipients:
        raise ValueError("Email has no recipients.")

    content: dict[str, str] = {"subject": message.subject}

    # Django signals an HTML-only message via content_subtype.
    if getattr(message, "content_subtype", "plain") == "html":
        content["html"] = message.body
    else:
        content["plainText"] = message.body

    if isinstance(message, EmailMultiAlternatives):
        for alternative, mimetype in message.alternatives or []:
            if mimetype == "text/html":
                content["html"] = alternative

    payload: dict[str, Any] = {
        "senderAddress": sender_address,
        "recipients": recipients,
        "content": content,
    }

    if message.reply_to:
        payload["replyTo"] = [_address(value) for value in message.reply_to]

    # Attachments are translated rather than dropped — silently losing one
    # would be a bug that only shows up in production.
    attachments = []
    for attachment in message.attachments:
        if isinstance(attachment, tuple):
            filename, attachment_content, mimetype = (list(attachment) + [None, None])[:3]
        else:  # MIMEBase
            filename = attachment.get_filename()
            attachment_content = attachment.get_payload(decode=True)
            mimetype = attachment.get_content_type()

        if isinstance(attachment_content, str):
            attachment_content = attachment_content.encode()

        attachments.append(
            {
                "name": filename or "attachment",
                "contentType": mimetype or "application/octet-stream",
                "contentInBase64": base64.b64encode(attachment_content).decode(),
            }
        )
    if attachments:
        payload["attachments"] = attachments

    extra_headers = {
        key: value for key, value in (message.extra_headers or {}).items() if key.lower() != "from"
    }
    if extra_headers:
        payload["headers"] = extra_headers

    return payload


class AzureCommunicationEmailBackend(BaseEmailBackend):
    def __init__(self, fail_silently: bool = False, **kwargs) -> None:
        super().__init__(fail_silently=fail_silently, **kwargs)

        self.connection_string = getattr(settings, "AZURE_ACS_CONNECTION_STRING", "") or ""
        self.endpoint = getattr(settings, "AZURE_ACS_ENDPOINT", "") or ""
        self.access_key = getattr(settings, "AZURE_ACS_ACCESS_KEY", "") or ""
        self.sender = getattr(settings, "AZURE_ACS_SENDER", "") or settings.DEFAULT_FROM_EMAIL
        self.wait_for_send = bool(getattr(settings, "AZURE_ACS_WAIT_FOR_SEND", False))

        if not self.connection_string and not (self.endpoint and self.access_key):
            raise ImproperlyConfigured(
                "Azure ACS email backend needs AZURE_ACS_CONNECTION_STRING, or both "
                "AZURE_ACS_ENDPOINT and AZURE_ACS_ACCESS_KEY."
            )
        if not self.sender:
            raise ImproperlyConfigured(
                "Azure ACS email backend needs AZURE_ACS_SENDER — a verified sender "
                "address on a domain provisioned in the ACS resource."
            )

        self._client = None

    def _get_client(self):
        if self._client is not None:
            return self._client

        try:
            from azure.communication.email import EmailClient
        except ImportError as exc:  # pragma: no cover — depends on optional extra
            raise ImproperlyConfigured(
                "azure-communication-email is not installed. Run `uv sync --extra azure`."
            ) from exc

        if self.connection_string:
            self._client = EmailClient.from_connection_string(self.connection_string)
        else:
            from azure.core.credentials import AzureKeyCredential

            self._client = EmailClient(self.endpoint, AzureKeyCredential(self.access_key))

        return self._client

    def send_messages(self, email_messages) -> int:
        if not email_messages:
            return 0

        client = self._get_client()
        sent = 0

        for message in email_messages:
            try:
                payload = build_acs_message(message, self.sender)
                poller = client.begin_send(payload)
                if self.wait_for_send:
                    result = poller.result()
                    logger.info("ACS message sent", extra={"operation_id": result.get("id")})
            except Exception:
                # Never log the payload — it contains recipient addresses and
                # one-time codes.
                logger.exception("Azure ACS send failed")
                if not self.fail_silently:
                    raise
                continue
            sent += 1

        return sent
