"""Joining an event, and spending shots.

The rule this module exists to enforce, from CONCEPT.md:

    "A crucial implementation detail is the shot counter. Never rely solely on
    a client-side value. Reserve a shot server-side before issuing the upload
    URL, and release the reservation when an upload fails or expires."

So a shot moves through three states:

    remaining → reserved → committed
                    ↓
                 expired (released back to remaining)

Everything that touches the counter takes a row lock on the participant, so
two tabs racing the shutter cannot both win the last shot.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.events.models import Event
from apps.media.models import MediaAsset, ProcessingStatus
from apps.media.storage import ALLOWED_MIME_TYPES, original_key, presign_put

from .models import CameraSession, Participant

CAMERA_SESSION_TTL = timedelta(days=90)

# How long a reserved shot is held before it returns to the pool. Long enough
# to upload a photograph on bad venue wifi, short enough that a guest whose
# phone died does not lose a shot for the rest of the night.
RESERVATION_TTL = timedelta(minutes=15)

EXTENSION_BY_MIME = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "image/webp": "webp",
}


class RefusedError(Exception):
    """A refusal the client should explain in the reader's own language.

    Carries a stable `code` as well as English prose. The prose is a fallback
    for logs and for clients that do not know the code yet; the code is what
    a client translates. Sending only prose meant a German screen showing an
    English sentence, which is what shipping server strings to a UI always
    ends up looking like.
    """

    code = "error"

    def __init__(self, message: str, code: str | None = None):
        super().__init__(message)
        if code:
            self.code = code


class JoinError(RefusedError):
    """Refusal to let somebody join."""


class CaptureError(RefusedError):
    """Refusal to spend a shot."""


@dataclass
class JoinResult:
    participant: Participant
    token: str
    created: bool


@dataclass
class Reservation:
    media: MediaAsset
    upload_url: str
    shots_remaining: int


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# --- Joining ---------------------------------------------------------------


def _issue_camera_session(participant: Participant, user_agent: str) -> str:
    token = secrets.token_urlsafe(32)
    CameraSession.objects.create(
        participant=participant,
        token_hash=hash_token(token),
        user_agent=user_agent[:300],
        expires_at=timezone.now() + CAMERA_SESSION_TTL,
    )
    return token


@transaction.atomic
def join_event(
    event: Event,
    *,
    display_name: str,
    user=None,
    email: str = "",
    consent_version: str = "",
    user_agent: str = "",
) -> JoinResult:
    """Join an event as a participant, or return to an existing participation.

    A signed-in person rejoins their own participation rather than creating a
    second one — including a host walking into their own event, who is a
    participant there like anybody else.
    """
    if not event.is_capture_open:
        raise JoinError("This event isn't open for photos right now.", "event_closed")

    name = display_name.strip()
    if not name:
        raise JoinError("Please enter a name.", "name_required")

    existing = None
    if user is not None:
        existing = Participant.objects.filter(event=event, user=user).first()

    if existing is not None:
        return JoinResult(
            participant=existing,
            token=_issue_camera_session(existing, user_agent),
            created=False,
        )

    # Capacity is what the host paid for, so it is counted at the door.
    if event.participants.count() >= event.guest_capacity:
        raise JoinError("This event is full. Ask your host to make room.", "event_full")

    participant = Participant.objects.create(
        event=event,
        user=user,
        display_name=name[:80],
        email=email.strip()[:254],
        anonymous_session_id=uuid.uuid4().hex,
        shot_limit=event.shots_per_guest,
        consent_version=consent_version,
    )

    return JoinResult(
        participant=participant,
        token=_issue_camera_session(participant, user_agent),
        created=True,
    )


def resolve_camera_session(token: str) -> Participant | None:
    session = (
        CameraSession.objects.select_related("participant", "participant__event")
        .filter(token_hash=hash_token(token))
        .first()
    )
    if session is None or not session.is_valid:
        return None

    session.save(update_fields=["last_used_at"])
    return session.participant


# --- Spending shots --------------------------------------------------------


def release_expired_reservations(participant: Participant) -> int:
    """Return abandoned reservations to the pool.

    Called under the participant's row lock, so the count cannot drift.
    """
    expired = list(
        MediaAsset.objects.filter(
            participant=participant,
            processing_status=ProcessingStatus.RESERVED,
            reservation_expires_at__lt=timezone.now(),
        ).values_list("id", flat=True)
    )
    if not expired:
        return 0

    MediaAsset.objects.filter(id__in=expired).update(processing_status=ProcessingStatus.EXPIRED)
    participant.shots_reserved = max(0, participant.shots_reserved - len(expired))
    participant.save(update_fields=["shots_reserved"])
    return len(expired)


@transaction.atomic
def reserve_shot(
    participant: Participant, *, content_type: str, public_endpoint: str | None = None
) -> Reservation:
    """Claim one shot and hand back a URL to upload it to.

    The reservation happens *before* the URL exists. A client that never
    uploads loses nothing permanently — the reservation expires — but it can
    never obtain more upload URLs than it has shots.
    """
    if content_type not in ALLOWED_MIME_TYPES:
        raise CaptureError("That file type isn't supported.", "unsupported_type")

    # Lock the counter for the whole decision.
    locked = Participant.objects.select_for_update().get(pk=participant.pk)
    release_expired_reservations(locked)

    event = locked.event
    if not event.is_capture_open:
        raise CaptureError("This event isn't open for photos right now.", "event_closed")

    if locked.shots_remaining <= 0:
        raise CaptureError("That's the roll.", "no_shots")

    locked.shots_reserved += 1
    locked.save(update_fields=["shots_reserved"])

    media = MediaAsset.objects.create(
        event=event,
        participant=locked,
        storage_key="",
        mime_type=content_type,
        processing_status=ProcessingStatus.RESERVED,
        reservation_expires_at=timezone.now() + RESERVATION_TTL,
    )
    media.storage_key = original_key(event.id, media.id, EXTENSION_BY_MIME.get(content_type, "jpg"))
    media.save(update_fields=["storage_key"])

    return Reservation(
        media=media,
        upload_url=presign_put(media.storage_key, content_type, public_endpoint=public_endpoint),
        shots_remaining=locked.shots_remaining,
    )


@transaction.atomic
def confirm_upload(
    participant: Participant,
    media_id,
    *,
    byte_size: int | None = None,
    checksum: str = "",
    captured_at=None,
) -> MediaAsset:
    """Turn a reservation into a committed photograph.

    Idempotent: a client that retries a confirmation it already made — which
    happens constantly on a flaky connection — must not spend a second shot.
    """
    media = (
        MediaAsset.objects.select_for_update().filter(id=media_id, participant=participant).first()
    )
    if media is None:
        raise CaptureError("We couldn't find that photo.", "photo_not_found")

    if media.processing_status != ProcessingStatus.RESERVED:
        # Already confirmed, or expired and released. Either way, saying so
        # again must not move the counter.
        if media.processing_status == ProcessingStatus.EXPIRED:
            raise CaptureError(
                "That upload took too long. Take the photo again.",
                "reservation_expired",
            )
        return media

    locked = Participant.objects.select_for_update().get(pk=participant.pk)

    media.processing_status = ProcessingStatus.UPLOADED
    media.uploaded_at = timezone.now()
    media.captured_at = captured_at or media.captured_at
    if byte_size:
        media.byte_size = byte_size
    if checksum:
        media.checksum = checksum
    media.save(
        update_fields=["processing_status", "uploaded_at", "captured_at", "byte_size", "checksum"]
    )

    locked.shots_reserved = max(0, locked.shots_reserved - 1)
    locked.shots_committed += 1
    locked.save(update_fields=["shots_reserved", "shots_committed"])

    return media


@transaction.atomic
def abandon_reservation(participant: Participant, media_id) -> None:
    """Give a shot back when the client knows the upload failed.

    Better than waiting for expiry: a guest who retakes immediately should not
    be down a shot for fifteen minutes.
    """
    media = (
        MediaAsset.objects.select_for_update()
        .filter(id=media_id, participant=participant, processing_status=ProcessingStatus.RESERVED)
        .first()
    )
    if media is None:
        return

    media.processing_status = ProcessingStatus.EXPIRED
    media.save(update_fields=["processing_status"])

    locked = Participant.objects.select_for_update().get(pk=participant.pk)
    locked.shots_reserved = max(0, locked.shots_reserved - 1)
    locked.save(update_fields=["shots_reserved"])


def guest_base_url() -> str:
    return settings.GUEST_BASE_URL.rstrip("/")
