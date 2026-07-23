"""The capture mechanic.

CONCEPT.md: "Never rely solely on a client-side value. Reserve a shot
server-side before issuing the upload URL, and release the reservation when an
upload fails or expires."

These tests exist to make sure a guest can never end up with more photographs
than shots, and never loses a shot they did not spend.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.events.models import Event, EventStatus
from apps.media.models import MediaAsset, ProcessingStatus
from apps.participants.models import CameraSession, Participant
from apps.participants.services import (
    CaptureError,
    JoinError,
    abandon_reservation,
    confirm_upload,
    join_event,
    reserve_shot,
    resolve_camera_session,
)


@pytest.fixture
def event(db) -> Event:
    now = timezone.now()
    return Event.objects.create(
        title="Anna & Ben",
        public_slug="anna-ben",
        status=EventStatus.PUBLISHED,
        capture_starts_at=now - timedelta(hours=1),
        capture_ends_at=now + timedelta(hours=6),
        guest_capacity=10,
        shots_per_guest=3,
    )


def joined(event: Event, name: str = "Tante Erika", **kwargs) -> Participant:
    return join_event(event, display_name=name, **kwargs).participant


# --- Joining ---------------------------------------------------------------


@pytest.mark.django_db
def test_joining_needs_no_account(event):
    result = join_event(event, display_name="Tante Erika")

    assert result.created is True
    assert result.participant.user is None
    assert result.participant.shot_limit == 3
    assert result.token


@pytest.mark.django_db
def test_camera_session_token_is_stored_only_as_a_hash(event):
    result = join_event(event, display_name="Tante Erika")

    session = CameraSession.objects.get()
    assert result.token not in session.token_hash
    assert resolve_camera_session(result.token) == result.participant


@pytest.mark.django_db
def test_a_host_photographing_their_own_event_reuses_one_identity(event):
    """One account, roles per event — not a second participation."""
    christoph = User.objects.create_user(email="host@example.com")

    first = join_event(event, display_name="Christoph", user=christoph)
    second = join_event(event, display_name="Christoph", user=christoph)

    assert first.created is True
    assert second.created is False
    assert first.participant == second.participant
    assert event.participants.count() == 1


@pytest.mark.django_db
def test_capacity_is_enforced_at_the_door(event):
    event.guest_capacity = 1
    event.save()

    joined(event, "First")
    with pytest.raises(JoinError, match="full"):
        joined(event, "Second")


@pytest.mark.django_db
def test_cannot_join_a_closed_event(event):
    event.capture_ends_at = timezone.now() - timedelta(minutes=1)
    event.save()

    with pytest.raises(JoinError, match="isn't open"):
        joined(event)


# --- Reserving -------------------------------------------------------------


@pytest.mark.django_db
def test_reserving_spends_a_shot_before_the_url_exists(event):
    participant = joined(event)

    reservation = reserve_shot(participant, content_type="image/jpeg")

    participant.refresh_from_db()
    assert participant.shots_reserved == 1
    assert participant.shots_committed == 0
    assert participant.shots_remaining == 2
    assert reservation.upload_url.startswith("http")
    assert reservation.media.processing_status == ProcessingStatus.RESERVED


@pytest.mark.django_db
def test_a_guest_cannot_obtain_more_urls_than_shots(event):
    """The whole point. Three shots means three upload URLs, ever."""
    participant = joined(event)

    for _ in range(3):
        reserve_shot(participant, content_type="image/jpeg")

    with pytest.raises(CaptureError, match="the roll"):
        reserve_shot(participant, content_type="image/jpeg")

    participant.refresh_from_db()
    assert participant.shots_remaining == 0
    assert MediaAsset.objects.filter(participant=participant).count() == 3


@pytest.mark.django_db
def test_unsupported_content_type_is_refused(event):
    participant = joined(event)

    with pytest.raises(CaptureError):
        reserve_shot(participant, content_type="application/pdf")


@pytest.mark.django_db
def test_cannot_reserve_after_capture_closes(event):
    participant = joined(event)
    event.capture_ends_at = timezone.now() - timedelta(minutes=1)
    event.save()
    participant.refresh_from_db()

    with pytest.raises(CaptureError, match="isn't open"):
        reserve_shot(participant, content_type="image/jpeg")


# --- Confirming ------------------------------------------------------------


@pytest.mark.django_db
def test_confirming_moves_reserved_to_committed(event):
    participant = joined(event)
    reservation = reserve_shot(participant, content_type="image/jpeg")

    confirm_upload(participant, reservation.media.id, byte_size=1234, checksum="abc")

    participant.refresh_from_db()
    assert participant.shots_reserved == 0
    assert participant.shots_committed == 1
    assert participant.shots_remaining == 2

    reservation.media.refresh_from_db()
    assert reservation.media.processing_status == ProcessingStatus.UPLOADED
    assert reservation.media.byte_size == 1234


@pytest.mark.django_db
def test_confirming_twice_does_not_spend_a_second_shot(event):
    """Retried confirmations are constant on a flaky venue connection."""
    participant = joined(event)
    reservation = reserve_shot(participant, content_type="image/jpeg")

    confirm_upload(participant, reservation.media.id)
    confirm_upload(participant, reservation.media.id)

    participant.refresh_from_db()
    assert participant.shots_committed == 1
    assert participant.shots_remaining == 2


@pytest.mark.django_db
def test_one_guest_cannot_confirm_another_guests_photo(event):
    mine = joined(event, "Mine")
    theirs = joined(event, "Theirs")
    reservation = reserve_shot(theirs, content_type="image/jpeg")

    with pytest.raises(CaptureError):
        confirm_upload(mine, reservation.media.id)


# --- Releasing -------------------------------------------------------------


@pytest.mark.django_db
def test_an_expired_reservation_returns_the_shot(event):
    """A phone that dies mid-upload must not cost a shot for the night."""
    participant = joined(event)
    reservation = reserve_shot(participant, content_type="image/jpeg")

    MediaAsset.objects.filter(id=reservation.media.id).update(
        reservation_expires_at=timezone.now() - timedelta(seconds=1)
    )

    # The next reservation sweeps expired ones first.
    reserve_shot(participant, content_type="image/jpeg")

    participant.refresh_from_db()
    assert participant.shots_reserved == 1
    assert participant.shots_remaining == 2

    reservation.media.refresh_from_db()
    assert reservation.media.processing_status == ProcessingStatus.EXPIRED


@pytest.mark.django_db
def test_confirming_an_expired_reservation_is_refused(event):
    participant = joined(event)
    reservation = reserve_shot(participant, content_type="image/jpeg")
    MediaAsset.objects.filter(id=reservation.media.id).update(
        processing_status=ProcessingStatus.EXPIRED
    )

    with pytest.raises(CaptureError, match="took too long"):
        confirm_upload(participant, reservation.media.id)


@pytest.mark.django_db
def test_abandoning_returns_the_shot_immediately(event):
    participant = joined(event)
    reservation = reserve_shot(participant, content_type="image/jpeg")

    abandon_reservation(participant, reservation.media.id)

    participant.refresh_from_db()
    assert participant.shots_reserved == 0
    assert participant.shots_remaining == 3


@pytest.mark.django_db
def test_abandoning_twice_does_not_create_shots(event):
    participant = joined(event)
    reservation = reserve_shot(participant, content_type="image/jpeg")

    abandon_reservation(participant, reservation.media.id)
    abandon_reservation(participant, reservation.media.id)

    participant.refresh_from_db()
    assert participant.shots_remaining == 3
