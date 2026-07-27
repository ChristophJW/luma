"""Child-face blur: the task, the upload gating, and album serving.

The invariant that matters most: in a blur-on event an un-blurred original is
never served. That shows up here as (a) the task only marks READY after a
derivative exists, (b) confirm holds the photo in PROCESSING and enqueues, and
(c) the album serves the derivative and hides anything not yet processed.

The detector and storage I/O are stubbed — these tests are about the pipeline,
not OpenCV. The detector itself needs model weights and is exercised
separately/manually.
"""

import secrets
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import AuthSession, User
from apps.accounts.services import hash_token
from apps.events.models import Event
from apps.media import storage
from apps.media.models import MediaAsset, ProcessingStatus
from apps.participants.models import Participant


def auth_headers(user: User) -> dict[str, str]:
    token = secrets.token_urlsafe(32)
    AuthSession.objects.create(
        user=user, token_hash=hash_token(token), expires_at=timezone.now() + timedelta(days=1)
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def host(db) -> User:
    return User.objects.create_user(email="host@example.com")


def _blur_event(host: User, **overrides) -> Event:
    fields = dict(
        host=host,
        title="Kita-Sommerfest",
        timezone_name="Europe/Berlin",
        involves_minors=True,
        blur_child_faces=True,
    )
    fields.update(overrides)
    return Event.objects.create(**fields)


def _guest(event: Event, name: str = "Anna", **overrides) -> Participant:
    fields = dict(event=event, display_name=name, anonymous_session_id=secrets.token_hex(4), shot_limit=20)
    fields.update(overrides)
    return Participant.objects.create(**fields)


# --- The task ---------------------------------------------------------------


@pytest.mark.django_db
def test_task_writes_derivative_then_marks_ready(host, monkeypatch):
    from apps.faces import detector, tasks

    event = _blur_event(host)
    media = MediaAsset.objects.create(
        event=event,
        participant=_guest(event),
        storage_key="o.jpg",
        processing_status=ProcessingStatus.PROCESSING,
    )

    put = {}
    monkeypatch.setattr(storage, "get_bytes", lambda key, bucket=None: b"original")
    monkeypatch.setattr(
        storage,
        "put_bytes",
        lambda key, data, ct, bucket=None: put.update(key=key, data=data, bucket=bucket),
    )
    monkeypatch.setattr(detector, "blur_children_in_image", lambda data: b"blurred-bytes")

    tasks.blur_faces(str(media.id))

    media.refresh_from_db()
    assert media.processing_status == ProcessingStatus.READY
    assert media.blurred_storage_key == storage.blurred_key(event.id, media.id)
    assert put["data"] == b"blurred-bytes"
    assert put["key"] == media.blurred_storage_key
    assert put["bucket"]  # written to the derivatives bucket, not originals


@pytest.mark.django_db
def test_task_fails_closed_on_undecodable_image(host, monkeypatch):
    """A photo we could not blur must never be published."""
    from apps.faces import detector, tasks

    event = _blur_event(host)
    media = MediaAsset.objects.create(
        event=event,
        participant=_guest(event),
        storage_key="o.jpg",
        processing_status=ProcessingStatus.PROCESSING,
    )

    monkeypatch.setattr(storage, "get_bytes", lambda key, bucket=None: b"junk")

    def boom(_data):
        raise ValueError("undecodable")

    monkeypatch.setattr(detector, "blur_children_in_image", boom)

    def must_not_publish(*_a, **_k):
        raise AssertionError("must not write a derivative for an unblurred photo")

    monkeypatch.setattr(storage, "put_bytes", must_not_publish)

    tasks.blur_faces(str(media.id))

    media.refresh_from_db()
    assert media.processing_status == ProcessingStatus.FAILED
    assert media.blurred_storage_key == ""


@pytest.mark.django_db
def test_task_publishes_original_when_blur_turned_off_after_upload(host):
    from apps.faces import tasks

    event = _blur_event(host)
    media = MediaAsset.objects.create(
        event=event,
        participant=_guest(event),
        storage_key="o.jpg",
        processing_status=ProcessingStatus.PROCESSING,
    )

    # The host changed their mind before the task ran.
    event.involves_minors = False
    event.blur_child_faces = False
    event.save()

    tasks.blur_faces(str(media.id))

    media.refresh_from_db()
    assert media.processing_status == ProcessingStatus.READY
    assert media.blurred_storage_key == ""


# --- Upload gating ----------------------------------------------------------


@pytest.mark.django_db
def test_confirm_holds_in_processing_and_enqueues_when_blur_on(
    host, monkeypatch, django_capture_on_commit_callbacks
):
    from apps.participants import services

    dispatched: list = []
    monkeypatch.setattr(services, "_dispatch_blur", lambda media_id: dispatched.append(media_id))

    event = _blur_event(host)
    guest = _guest(event, shots_reserved=1)
    media = MediaAsset.objects.create(
        event=event,
        participant=guest,
        storage_key="o.jpg",
        processing_status=ProcessingStatus.RESERVED,
    )

    with django_capture_on_commit_callbacks(execute=True):
        services.confirm_upload(guest, media.id)

    media.refresh_from_db()
    assert media.processing_status == ProcessingStatus.PROCESSING
    assert dispatched == [media.id]


@pytest.mark.django_db
def test_confirm_commits_straight_to_uploaded_when_blur_off(
    host, monkeypatch, django_capture_on_commit_callbacks
):
    from apps.participants import services

    dispatched: list = []
    monkeypatch.setattr(services, "_dispatch_blur", lambda media_id: dispatched.append(media_id))

    event = Event.objects.create(host=host, title="Anna & Ben", timezone_name="Europe/Berlin")
    guest = _guest(event, shots_reserved=1)
    media = MediaAsset.objects.create(
        event=event,
        participant=guest,
        storage_key="o.jpg",
        processing_status=ProcessingStatus.RESERVED,
    )

    with django_capture_on_commit_callbacks(execute=True):
        services.confirm_upload(guest, media.id)

    media.refresh_from_db()
    assert media.processing_status == ProcessingStatus.UPLOADED
    assert dispatched == []


# --- Album serving ----------------------------------------------------------


@pytest.mark.django_db
def test_album_serves_the_blurred_derivative_and_hides_unprocessed(client, host):
    event = _blur_event(host, revealed_at=timezone.now())
    guest = _guest(event)

    ready = MediaAsset.objects.create(
        event=event, participant=guest, storage_key="o.jpg", processing_status=ProcessingStatus.READY
    )
    ready.blurred_storage_key = storage.blurred_key(event.id, ready.id)
    ready.save(update_fields=["blurred_storage_key"])

    # Still processing — no derivative yet. Must not appear in the album.
    MediaAsset.objects.create(
        event=event,
        participant=guest,
        storage_key="p.jpg",
        processing_status=ProcessingStatus.PROCESSING,
    )

    response = client.get(f"/api/events/{event.id}/album", headers=auth_headers(host))
    assert response.status_code == 200

    photos = response.json()
    assert len(photos) == 1
    assert photos[0]["id"] == str(ready.id)
    # The URL points at the derivatives bucket, never the original.
    assert "luma-derivatives" in photos[0]["url"]
