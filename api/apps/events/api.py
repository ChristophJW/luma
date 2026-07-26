"""Event endpoints.

Two audiences with very different rights:

* the guest path is unauthenticated and returns only what a person needs to
  decide whether to join
* the host path requires a session and only ever touches the caller's own
  events
"""

import io
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.db.models import Count, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from ninja import Router, Schema, Status
from ninja.errors import HttpError
from pydantic import Field, model_validator

from apps.accounts.api import session_auth
from apps.media.models import ModerationStatus, ProcessingStatus

from .models import CaptureMode, Event, EventStatus, Theme, VisibilityMode

# What counts as a photograph the host actually has. A reserved slot is a
# shutter press that never landed, and an expired one was abandoned —
# counting either would show a host photographs that do not exist.
COUNTED_PROCESSING = [
    ProcessingStatus.UPLOADED,
    ProcessingStatus.PROCESSING,
    ProcessingStatus.READY,
]

router = Router()

MAX_GUEST_CAPACITY = 500
MAX_SHOTS_PER_GUEST = 100


# --- Guest path ------------------------------------------------------------


class EventPublicOut(Schema):
    """What a guest may see before joining. Deliberately minimal.

    The capture window is included because a guest who arrives early needs to
    be told *when* they can start, not merely that they cannot.
    """

    title: str
    event_type: str
    join_code: str
    shots_per_guest: int
    capture_mode: str
    theme: str
    is_capture_open: bool
    is_revealed: bool
    face_lookup_enabled: bool
    capture_starts_at: datetime | None
    capture_ends_at: datetime | None
    reveals_at: datetime | None
    timezone_name: str


def join_url_for(event: Event) -> str:
    return f"{settings.GUEST_BASE_URL.rstrip('/')}/join/{event.join_code}"


@router.get("/by-code/{join_code}", response=EventPublicOut, tags=["guest"], auth=None)
def event_by_join_code(request, join_code: str) -> Event:
    """Resolve a scanned QR code to its event cover.

    Looks up by the printed join code, never by internal ID.
    """
    return get_object_or_404(Event, join_code=join_code.upper())


@router.get("/by-code/{join_code}/qr.png", tags=["guest"], auth=None, response=None)
def event_qr_code(request, join_code: str, size: int = 8):
    """The join QR as a PNG.

    Public, and keyed by the join code rather than the internal id. Anyone
    holding the code can already join, so rendering it as a square reveals
    nothing further — and a public URL means the image can be shown by an
    <Image> tag that cannot attach an Authorization header on the web.

    Rendered server-side so the in-app code, the printable signs and the
    table cards all come from one source (CHECKLIST.md §6).
    """
    import qrcode

    event = get_object_or_404(Event, join_code=join_code.upper())

    code = qrcode.QRCode(
        # High correction, because this gets printed and then handled, spilled
        # on, and photographed at an angle in bad light.
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=max(1, min(size, 40)),
        border=2,
    )
    code.add_data(join_url_for(event))
    code.make(fit=True)

    buffer = io.BytesIO()
    code.make_image(fill_color="#14110F", back_color="#FFFDFA").save(buffer, format="PNG")

    response = HttpResponse(buffer.getvalue(), content_type="image/png")
    response["Cache-Control"] = "public, max-age=3600"
    return response


# --- Host path -------------------------------------------------------------


def _validate_timezone(name: str) -> str:
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError(f"Unknown timezone: {name}") from exc
    return name


class EventWriteIn(Schema):
    """Fields a host controls. Mirrors CONCEPT.md §1."""

    title: str = Field(min_length=1, max_length=200)
    event_type: str = "wedding"
    location: str = Field(default="", max_length=200)
    timezone_name: str = "Europe/Berlin"

    capture_starts_at: datetime | None = None
    capture_ends_at: datetime | None = None
    reveals_at: datetime | None = None

    theme: Theme = Theme.NOON
    highlight_reel_enabled: bool = True
    guest_capacity: int = Field(default=5, ge=1, le=MAX_GUEST_CAPACITY)
    shots_per_guest: int = Field(default=20, ge=1, le=MAX_SHOTS_PER_GUEST)

    visibility_mode: VisibilityMode = VisibilityMode.HIDDEN
    capture_mode: CaptureMode = CaptureMode.CAMERA_ONLY
    guest_downloads_enabled: bool = True

    involves_minors: bool = False
    face_lookup_enabled: bool = False
    blur_child_faces: bool = False

    @model_validator(mode="after")
    def check_consistency(self):
        _validate_timezone(self.timezone_name)

        if self.capture_starts_at and self.capture_ends_at:
            if self.capture_ends_at <= self.capture_starts_at:
                raise ValueError("Capture must end after it starts.")

        # Revealing before capture closes would show a half-finished album and
        # quietly break the promise that everyone discovers it together.
        if self.reveals_at and self.capture_ends_at:
            if self.reveals_at < self.capture_ends_at:
                raise ValueError("The album cannot reveal before capture closes.")

        # Belt and braces — the model and a database constraint enforce this
        # too, but rejecting it here gives the host a usable message.
        if self.involves_minors and self.face_lookup_enabled:
            raise ValueError("Face lookup cannot be enabled for an event involving minors.")

        # Blurring children is meaningless unless children are declared, and
        # silently ignoring the flag would leave a host believing it is on.
        if self.blur_child_faces and not self.involves_minors:
            raise ValueError(
                "Blurring children's faces requires the event to declare that "
                "children will be photographed."
            )

        return self


class EventOut(Schema):
    id: str
    title: str
    event_type: str
    location: str
    status: str
    join_code: str
    public_slug: str
    join_url: str

    timezone_name: str
    capture_starts_at: datetime | None
    capture_ends_at: datetime | None
    reveals_at: datetime | None
    revealed_at: datetime | None

    theme: str
    highlight_reel_enabled: bool
    reveal_withheld: bool
    guest_capacity: int
    shots_per_guest: int
    visibility_mode: str
    capture_mode: str
    guest_downloads_enabled: bool
    involves_minors: bool
    face_lookup_enabled: bool
    blur_child_faces: bool

    is_capture_open: bool
    is_revealed: bool

    participant_count: int
    photo_count: int

    @staticmethod
    def resolve_id(obj: Event) -> str:
        return str(obj.id)

    @staticmethod
    def resolve_join_url(obj: Event) -> str:
        return join_url_for(obj)

    @staticmethod
    def resolve_participant_count(obj: Event) -> int:
        # Annotated on the list query to avoid a count per row.
        annotated = getattr(obj, "participants_total", None)
        return annotated if annotated is not None else obj.participants.count()

    @staticmethod
    def resolve_photo_count(obj: Event) -> int:
        annotated = getattr(obj, "photos_total", None)
        if annotated is not None:
            return annotated
        return (
            obj.media.filter(
                processing_status__in=COUNTED_PROCESSING,
            )
            .exclude(moderation_status=ModerationStatus.REMOVED)
            .count()
        )


def _unique_slug(title: str) -> str:
    base = slugify(title)[:50] or "event"
    slug = base
    suffix = 2
    while Event.objects.filter(public_slug=slug).exists():
        slug = f"{base}-{suffix}"
        suffix += 1
    return slug


def _owned_event(request, event_id: str) -> Event:
    """Fetch an event the caller hosts.

    Scoped by host at the query, so another host's event is a 404 rather than
    a 403 — an authorisation check that also refuses to confirm existence.
    """
    return get_object_or_404(Event, id=event_id, host=request.auth)


@router.get("", response=list[EventOut], tags=["host"], auth=session_auth)
def list_events(request):
    """Events the caller hosts. "My events" also shows attended ones, which
    come from a separate participations endpoint."""
    # Annotated rather than counted per row: a host with twenty events would
    # otherwise cost forty extra queries every poll.
    return (
        Event.objects.filter(host=request.auth)
        .annotate(
            participants_total=Count("participants", distinct=True),
            photos_total=Count(
                "media",
                filter=Q(media__processing_status__in=COUNTED_PROCESSING)
                & ~Q(media__moderation_status=ModerationStatus.REMOVED),
                distinct=True,
            ),
        )
        .order_by("-created_at")
    )


@router.post("", response={201: EventOut}, tags=["host"], auth=session_auth)
def create_event(request, payload: EventWriteIn):
    event = Event.objects.create(
        host=request.auth,
        public_slug=_unique_slug(payload.title),
        status=EventStatus.DRAFT,
        **payload.dict(),
    )
    return Status(201, event)


@router.get("/{event_id}", response=EventOut, tags=["host"], auth=session_auth)
def get_event(request, event_id: str) -> Event:
    return _owned_event(request, event_id)


@router.patch("/{event_id}", response=EventOut, tags=["host"], auth=session_auth)
def update_event(request, event_id: str, payload: EventWriteIn) -> Event:
    event = _owned_event(request, event_id)

    for field, value in payload.dict().items():
        setattr(event, field, value)
    event.save()
    return event


class PublishIn(Schema):
    publish: bool = True


@router.post("/{event_id}/publish", response=EventOut, tags=["host"], auth=session_auth)
def publish_event(request, event_id: str, payload: PublishIn) -> Event:
    """Make an event joinable, or pull it back to draft.

    A published event is one whose QR code works, so this is the moment the
    join code becomes meaningful.
    """
    event = _owned_event(request, event_id)

    if payload.publish:
        if not event.capture_ends_at:
            raise HttpError(400, "Set when capture ends before publishing.")
        event.status = EventStatus.PUBLISHED
        fields = ["status"]
        # Publishing means "open now". If the scheduled window doesn't cover this
        # moment — it starts later, or has already ended — shift it to start now,
        # keeping the intended duration, so capture is live immediately and the
        # host (and guests scanning the code) can shoot straight away.
        now = timezone.now()
        starts, ends = event.capture_starts_at, event.capture_ends_at
        if (starts and starts > now) or ends <= now:
            duration = ends - starts if starts and ends > starts else timedelta(hours=12)
            event.capture_starts_at = now
            event.capture_ends_at = now + duration
            fields += ["capture_starts_at", "capture_ends_at"]
        event.save(update_fields=fields)
    else:
        if event.participants.exists():
            raise HttpError(400, "Guests have already joined; this event cannot return to draft.")
        event.status = EventStatus.DRAFT
        event.save(update_fields=["status"])

    return event


class RevealIn(Schema):
    reveal: bool = True


@router.post("/{event_id}/reveal", response=EventOut, tags=["host"], auth=session_auth)
def reveal_event(request, event_id: str, payload: RevealIn) -> Event:
    """Open the album now, or close it again.

    Opening early is the common case: the party ended sooner than planned and
    everyone is still in the room. Closing again exists because a host who
    opened it by mistake needs a way back — it does not un-see anything for
    guests who were already looking.

    The scheduled reveal time is left untouched either way, so reverting never
    silently discards what the host configured.
    """
    event = _owned_event(request, event_id)

    if payload.reveal:
        event.reveal_withheld = False
        event.revealed_at = event.revealed_at or timezone.now()
        event.status = EventStatus.REVEALED
    else:
        event.reveal_withheld = True
        event.revealed_at = None
        event.status = EventStatus.WAITING

    event.save(update_fields=["reveal_withheld", "revealed_at", "status"])
    return event
