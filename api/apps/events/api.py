"""Event endpoints.

Only the guest-facing read path exists so far — enough to prove the loop from
QR code to a rendered cover screen. Join, shot reservation and upload land next.
"""

from django.shortcuts import get_object_or_404
from ninja import Router, Schema

from .models import Event

router = Router()


class EventPublicOut(Schema):
    """What a guest may see before joining. Deliberately minimal."""

    title: str
    event_type: str
    join_code: str
    shots_per_guest: int
    capture_mode: str
    is_capture_open: bool
    is_revealed: bool
    face_lookup_enabled: bool


@router.get("/by-code/{join_code}", response=EventPublicOut, tags=["guest"])
def event_by_join_code(request, join_code: str) -> Event:
    """Resolve a scanned QR code to its event cover.

    Looks up by the printed join code, never by internal ID.
    """
    return get_object_or_404(Event, join_code=join_code.upper())
