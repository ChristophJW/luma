"""Guest capture endpoints.

Everything here is reached with a camera-session token, never a host session.
A guest has no account, so the token *is* the identity.
"""

from datetime import datetime

from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from ninja import Router, Schema, Status
from ninja.errors import HttpError
from ninja.security import HttpBearer
from pydantic import Field

from apps.accounts.services import resolve_session as resolve_host_session
from apps.events.models import Event
from apps.media.models import MediaAsset, ModerationStatus, ProcessingStatus
from apps.media.storage import presign_get

from .services import (
    CaptureError,
    JoinError,
    abandon_reservation,
    confirm_upload,
    join_event,
    reserve_shot,
    resolve_camera_session,
)

router = Router()


class CameraAuth(HttpBearer):
    def authenticate(self, request: HttpRequest, token: str):
        return resolve_camera_session(token)


camera_auth = CameraAuth()


# --- Joining ---------------------------------------------------------------


class JoinIn(Schema):
    display_name: str = Field(min_length=1, max_length=80)
    email: str = ""
    consent_version: str = ""


class ParticipantOut(Schema):
    id: str
    display_name: str
    shot_limit: int
    shots_committed: int
    shots_remaining: int

    event_title: str
    event_theme: str
    capture_mode: str
    is_capture_open: bool
    is_revealed: bool
    reveals_at: datetime | None

    @staticmethod
    def resolve_id(obj) -> str:
        return str(obj.id)

    @staticmethod
    def resolve_event_title(obj) -> str:
        return obj.event.title

    @staticmethod
    def resolve_event_theme(obj) -> str:
        return obj.event.theme

    @staticmethod
    def resolve_capture_mode(obj) -> str:
        return obj.event.capture_mode

    @staticmethod
    def resolve_is_capture_open(obj) -> bool:
        return obj.event.is_capture_open

    @staticmethod
    def resolve_is_revealed(obj) -> bool:
        return obj.event.is_revealed

    @staticmethod
    def resolve_reveals_at(obj):
        return obj.event.reveals_at


class JoinOut(Schema):
    token: str
    created: bool
    participant: ParticipantOut


@router.post("/join/{join_code}", response={201: JoinOut}, tags=["guest"], auth=None)
def join(request, join_code: str, payload: JoinIn):
    """Join an event and receive a camera session.

    If the caller also carries a host session, the participation is linked to
    that account — which is how a host photographing their own wedding ends up
    with one identity rather than two.
    """
    event = get_object_or_404(Event, join_code=join_code.upper())

    user = None
    header = request.headers.get("X-Luma-Account", "")
    if header:
        user = resolve_host_session(header)

    try:
        result = join_event(
            event,
            display_name=payload.display_name,
            user=user,
            email=payload.email,
            consent_version=payload.consent_version,
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
    except JoinError as refusal:
        raise HttpError(409, str(refusal)) from refusal

    return Status(
        201,
        JoinOut(token=result.token, created=result.created, participant=result.participant),
    )


# --- The camera ------------------------------------------------------------


@router.get("/me", response=ParticipantOut, tags=["guest"], auth=camera_auth)
def me(request):
    return request.auth


class ReserveIn(Schema):
    content_type: str = "image/jpeg"


class ReserveOut(Schema):
    media_id: str
    upload_url: str
    storage_key: str
    shots_remaining: int
    expires_in: int


@router.post("/shots/reserve", response={201: ReserveOut}, tags=["guest"], auth=camera_auth)
def reserve(request, payload: ReserveIn):
    """Claim a shot and get a URL to upload it to.

    The shot is spent here, before any URL exists — a client cannot obtain
    more upload URLs than it has shots left.
    """
    from .services import RESERVATION_TTL

    try:
        reservation = reserve_shot(request.auth, content_type=payload.content_type)
    except CaptureError as refusal:
        raise HttpError(409, str(refusal)) from refusal

    return Status(
        201,
        ReserveOut(
            media_id=str(reservation.media.id),
            upload_url=reservation.upload_url,
            storage_key=reservation.media.storage_key,
            shots_remaining=reservation.shots_remaining,
            expires_in=int(RESERVATION_TTL.total_seconds()),
        ),
    )


class ConfirmIn(Schema):
    byte_size: int | None = None
    checksum: str = ""
    captured_at: datetime | None = None


class ConfirmOut(Schema):
    media_id: str
    shots_committed: int
    shots_remaining: int


@router.post("/shots/{media_id}/confirm", response=ConfirmOut, tags=["guest"], auth=camera_auth)
def confirm(request, media_id: str, payload: ConfirmIn):
    """Tell the server the upload landed. Safe to call twice."""
    try:
        media = confirm_upload(
            request.auth,
            media_id,
            byte_size=payload.byte_size,
            checksum=payload.checksum,
            captured_at=payload.captured_at,
        )
    except CaptureError as refusal:
        raise HttpError(409, str(refusal)) from refusal

    participant = request.auth
    participant.refresh_from_db()

    return ConfirmOut(
        media_id=str(media.id),
        shots_committed=participant.shots_committed,
        shots_remaining=participant.shots_remaining,
    )


@router.post("/shots/{media_id}/abandon", response={204: None}, tags=["guest"], auth=camera_auth)
def abandon(request, media_id: str):
    """Hand a shot back when the upload has definitively failed.

    Without this a guest who retakes immediately would be down a shot until
    the reservation expired.
    """
    abandon_reservation(request.auth, media_id)
    return Status(204, None)


# --- The guest's own gallery -----------------------------------------------
#
# Always reachable, whatever the host's album visibility says. Those settings
# govern the *shared* album; a person's own roll is their own personal data,
# and the right to erase it (Art. 17) is meaningless if they cannot see what
# they would be erasing.

VISIBLE_STATES = [
    ProcessingStatus.UPLOADED,
    ProcessingStatus.PROCESSING,
    ProcessingStatus.READY,
]


class PhotoOut(Schema):
    id: str
    url: str
    created_at: datetime

    @staticmethod
    def resolve_id(obj: MediaAsset) -> str:
        return str(obj.id)

    @staticmethod
    def resolve_url(obj: MediaAsset) -> str:
        # Signed and short-lived. Derivatives do not exist yet, so this is the
        # original — heavier than it should be, and the first thing the
        # processing pipeline fixes.
        return presign_get(obj.storage_key)


@router.get("/photos", response=list[PhotoOut], tags=["guest"], auth=camera_auth)
def my_photos(request):
    """Only ever this participant's own photographs."""
    return (
        MediaAsset.objects.filter(
            participant=request.auth,
            processing_status__in=VISIBLE_STATES,
        )
        .exclude(moderation_status=ModerationStatus.REMOVED)
        .order_by("-created_at")
    )


@router.delete("/photos/{media_id}", response={204: None}, tags=["guest"], auth=camera_auth)
def delete_photo(request, media_id: str):
    """Remove one of your own photographs.

    The shot is deliberately *not* returned. Handing it back would make
    delete-and-retake an unlimited roll, which is the one thing the whole
    reservation mechanic exists to prevent.

    Marked rather than erased here; the bytes are removed by the retention
    job, which is also what makes this recoverable from a mis-tap within the
    same window.
    """
    media = get_object_or_404(MediaAsset, id=media_id, participant=request.auth)

    if media.moderation_status != ModerationStatus.REMOVED:
        media.moderation_status = ModerationStatus.REMOVED
        media.save(update_fields=["moderation_status"])

    return Status(204, None)
