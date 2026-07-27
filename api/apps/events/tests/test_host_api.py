"""Host-facing event API.

Focus is on ownership scoping and the validation rules a host can actually
trip over — the rest is CRUD.
"""

from datetime import datetime, timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import hash_token
from apps.events.models import Event, EventStatus


def auth_headers(user: User) -> dict[str, str]:
    """Create a session directly — the code flow is tested in apps.accounts."""
    import secrets

    from apps.accounts.models import AuthSession

    token = secrets.token_urlsafe(32)
    AuthSession.objects.create(
        user=user,
        token_hash=hash_token(token),
        expires_at=timezone.now() + timedelta(days=1),
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def host(db) -> User:
    return User.objects.create_user(email="host@example.com")


@pytest.fixture
def other_host(db) -> User:
    return User.objects.create_user(email="other@example.com")


def valid_payload(**overrides) -> dict:
    now = timezone.now()
    payload = {
        "title": "Anna & Ben",
        "timezone_name": "Europe/Berlin",
        "capture_starts_at": (now + timedelta(days=10)).isoformat(),
        "capture_ends_at": (now + timedelta(days=11)).isoformat(),
        "reveals_at": (now + timedelta(days=12)).isoformat(),
        "theme": "golden",
        "guest_capacity": 100,
        "shots_per_guest": 20,
    }
    payload.update(overrides)
    return payload


# --- Auth ------------------------------------------------------------------


@pytest.mark.django_db
def test_host_endpoints_require_a_session(client):
    assert client.get("/api/events").status_code == 401
    assert (
        client.post("/api/events", valid_payload(), content_type="application/json").status_code
        == 401
    )


# --- Creation --------------------------------------------------------------


@pytest.mark.django_db
def test_create_event(client, host):
    response = client.post(
        "/api/events", valid_payload(), content_type="application/json", headers=auth_headers(host)
    )

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Anna & Ben"
    assert body["status"] == EventStatus.DRAFT
    assert body["theme"] == "golden"
    assert body["public_slug"] == "anna-ben"
    assert len(body["join_code"]) == 6
    assert body["participant_count"] == 0

    assert Event.objects.get(id=body["id"]).host == host


@pytest.mark.django_db
def test_slug_is_made_unique(client, host):
    for _ in range(2):
        client.post(
            "/api/events",
            valid_payload(),
            content_type="application/json",
            headers=auth_headers(host),
        )

    slugs = set(Event.objects.values_list("public_slug", flat=True))
    assert slugs == {"anna-ben", "anna-ben-2"}


# --- Validation ------------------------------------------------------------


@pytest.mark.django_db
def test_capture_must_end_after_it_starts(client, host):
    now = timezone.now()
    response = client.post(
        "/api/events",
        valid_payload(
            capture_starts_at=(now + timedelta(days=11)).isoformat(),
            capture_ends_at=(now + timedelta(days=10)).isoformat(),
        ),
        content_type="application/json",
        headers=auth_headers(host),
    )
    assert response.status_code == 422
    assert "end after it starts" in response.content.decode()


@pytest.mark.django_db
def test_album_cannot_reveal_before_capture_closes(client, host):
    """Otherwise the album opens half-finished and the shared-discovery
    promise quietly breaks."""
    now = timezone.now()
    response = client.post(
        "/api/events",
        valid_payload(
            capture_ends_at=(now + timedelta(days=11)).isoformat(),
            reveals_at=(now + timedelta(days=10)).isoformat(),
        ),
        content_type="application/json",
        headers=auth_headers(host),
    )
    assert response.status_code == 422
    assert "reveal before capture closes" in response.content.decode()


@pytest.mark.django_db
def test_unknown_timezone_is_rejected(client, host):
    response = client.post(
        "/api/events",
        valid_payload(timezone_name="Mars/Olympus_Mons"),
        content_type="application/json",
        headers=auth_headers(host),
    )
    assert response.status_code == 422


@pytest.mark.django_db
def test_face_lookup_cannot_be_enabled_for_an_event_involving_minors(client, host):
    response = client.post(
        "/api/events",
        valid_payload(involves_minors=True, face_lookup_enabled=True),
        content_type="application/json",
        headers=auth_headers(host),
    )
    assert response.status_code == 422
    assert "minors" in response.content.decode()


@pytest.mark.django_db
def test_capacity_and_shots_are_bounded(client, host):
    for field, value in (("guest_capacity", 100_000), ("shots_per_guest", 0)):
        response = client.post(
            "/api/events",
            valid_payload(**{field: value}),
            content_type="application/json",
            headers=auth_headers(host),
        )
        assert response.status_code == 422, field


# --- Ownership -------------------------------------------------------------


@pytest.mark.django_db
def test_list_only_returns_your_own_events(client, host, other_host):
    client.post(
        "/api/events", valid_payload(), content_type="application/json", headers=auth_headers(host)
    )
    client.post(
        "/api/events",
        valid_payload(title="Someone Else"),
        content_type="application/json",
        headers=auth_headers(other_host),
    )

    body = client.get("/api/events", headers=auth_headers(host)).json()
    assert [event["title"] for event in body] == ["Anna & Ben"]


@pytest.mark.django_db
def test_another_hosts_event_is_a_404_not_a_403(client, host, other_host):
    """Scoped by host at the query, so the response does not confirm that the
    event exists at all."""
    created = client.post(
        "/api/events", valid_payload(), content_type="application/json", headers=auth_headers(host)
    ).json()

    response = client.get(f"/api/events/{created['id']}", headers=auth_headers(other_host))
    assert response.status_code == 404


@pytest.mark.django_db
def test_update_event(client, host):
    created = client.post(
        "/api/events", valid_payload(), content_type="application/json", headers=auth_headers(host)
    ).json()

    response = client.patch(
        f"/api/events/{created['id']}",
        valid_payload(title="Anna & Ben Forever", theme="silver", shots_per_guest=12),
        content_type="application/json",
        headers=auth_headers(host),
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Anna & Ben Forever"
    assert response.json()["theme"] == "silver"
    assert response.json()["shots_per_guest"] == 12


# --- Publishing ------------------------------------------------------------


@pytest.mark.django_db
def test_publishing_requires_a_capture_end(client, host):
    created = client.post(
        "/api/events",
        valid_payload(capture_starts_at=None, capture_ends_at=None, reveals_at=None),
        content_type="application/json",
        headers=auth_headers(host),
    ).json()

    response = client.post(
        f"/api/events/{created['id']}/publish",
        {"publish": True},
        content_type="application/json",
        headers=auth_headers(host),
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_publish_makes_the_join_code_work(client, host):
    created = client.post(
        "/api/events", valid_payload(), content_type="application/json", headers=auth_headers(host)
    ).json()

    published = client.post(
        f"/api/events/{created['id']}/publish",
        {"publish": True},
        content_type="application/json",
        headers=auth_headers(host),
    ).json()

    assert published["status"] == EventStatus.PUBLISHED

    # And the guest path can now resolve it without any credentials.
    guest_view = client.get(f"/api/events/by-code/{created['join_code']}")
    assert guest_view.status_code == 200
    assert guest_view.json()["title"] == "Anna & Ben"


@pytest.mark.django_db
def test_publishing_opens_capture_now_even_with_a_future_start(client, host):
    # The default payload schedules capture to start in ten days.
    created = client.post(
        "/api/events", valid_payload(), content_type="application/json", headers=auth_headers(host)
    ).json()
    assert created["is_capture_open"] is False

    published = client.post(
        f"/api/events/{created['id']}/publish",
        {"publish": True},
        content_type="application/json",
        headers=auth_headers(host),
    ).json()

    # Publishing pulls the start to now, so the host can shoot immediately.
    assert published["is_capture_open"] is True
    started = datetime.fromisoformat(published["capture_starts_at"])
    assert started <= timezone.now()


@pytest.mark.django_db
def test_host_can_ask_for_children_to_be_blurred(client, host):
    response = client.post(
        "/api/events",
        valid_payload(involves_minors=True, blur_child_faces=True),
        content_type="application/json",
        headers=auth_headers(host),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["blur_child_faces"] is True
    assert body["face_lookup_enabled"] is False


@pytest.mark.django_db
def test_blurring_without_declaring_children_is_rejected(client, host):
    response = client.post(
        "/api/events",
        valid_payload(involves_minors=False, blur_child_faces=True),
        content_type="application/json",
        headers=auth_headers(host),
    )
    assert response.status_code == 422
    assert "children will be photographed" in response.content.decode()


# --- QR ---------------------------------------------------------------------


@pytest.mark.django_db
def test_qr_endpoint_returns_a_png_without_credentials(client, host):
    """Public on purpose: anyone holding the join code can already join, and a
    public URL means an <Image> can load it on the web, where custom headers
    are not possible."""
    created = client.post(
        "/api/events", valid_payload(), content_type="application/json", headers=auth_headers(host)
    ).json()

    response = client.get(f"/api/events/by-code/{created['join_code']}/qr.png")

    assert response.status_code == 200
    assert response["Content-Type"] == "image/png"
    assert response.content[:8] == b"\x89PNG\r\n\x1a\n"


@pytest.mark.django_db
def test_qr_encodes_the_join_url(client, host, settings):
    settings.GUEST_BASE_URL = "https://luma.de"
    created = client.post(
        "/api/events", valid_payload(), content_type="application/json", headers=auth_headers(host)
    ).json()

    assert created["join_url"] == f"https://luma.de/join/{created['join_code']}"


@pytest.mark.django_db
def test_qr_for_an_unknown_code_is_a_404(client):
    assert client.get("/api/events/by-code/NOPE99/qr.png").status_code == 404


# --- Counts -----------------------------------------------------------------


@pytest.mark.django_db
def test_photo_count_ignores_reserved_and_expired_slots(client, host):
    """A shutter press that never landed is not a photograph. Counting it
    would show a host photos they do not have."""
    from apps.media.models import MediaAsset, ProcessingStatus
    from apps.participants.models import Participant

    created = client.post(
        "/api/events", valid_payload(), content_type="application/json", headers=auth_headers(host)
    ).json()
    event = Event.objects.get(id=created["id"])
    guest = Participant.objects.create(
        event=event,
        display_name="Tante Erika",
        anonymous_session_id="abc123",
        shot_limit=20,
    )

    for status in (
        ProcessingStatus.RESERVED,
        ProcessingStatus.EXPIRED,
        ProcessingStatus.UPLOADED,
        ProcessingStatus.READY,
    ):
        MediaAsset.objects.create(event=event, participant=guest, processing_status=status)

    body = client.get("/api/events", headers=auth_headers(host)).json()[0]
    assert body["photo_count"] == 2
    assert body["participant_count"] == 1

    detail = client.get(f"/api/events/{event.id}", headers=auth_headers(host)).json()
    assert detail["photo_count"] == 2


@pytest.mark.django_db
def test_removed_photos_are_not_counted(client, host):
    from apps.media.models import MediaAsset, ModerationStatus, ProcessingStatus
    from apps.participants.models import Participant

    created = client.post(
        "/api/events", valid_payload(), content_type="application/json", headers=auth_headers(host)
    ).json()
    event = Event.objects.get(id=created["id"])
    guest = Participant.objects.create(
        event=event, display_name="G", anonymous_session_id="xyz", shot_limit=5
    )
    MediaAsset.objects.create(
        event=event,
        participant=guest,
        processing_status=ProcessingStatus.READY,
        moderation_status=ModerationStatus.REMOVED,
    )

    assert client.get("/api/events", headers=auth_headers(host)).json()[0]["photo_count"] == 0


# --- Reveal -----------------------------------------------------------------


@pytest.mark.django_db
def test_reveal_opens_the_album_now(client, host):
    created = client.post(
        "/api/events", valid_payload(), content_type="application/json", headers=auth_headers(host)
    ).json()
    assert created["is_revealed"] is False

    body = client.post(
        f"/api/events/{created['id']}/reveal",
        {"reveal": True},
        content_type="application/json",
        headers=auth_headers(host),
    ).json()

    assert body["is_revealed"] is True
    assert body["revealed_at"] is not None
    assert body["status"] == "revealed"


@pytest.mark.django_db
def test_reveal_can_be_reverted(client, host):
    created = client.post(
        "/api/events", valid_payload(), content_type="application/json", headers=auth_headers(host)
    ).json()
    client.post(
        f"/api/events/{created['id']}/reveal",
        {"reveal": True},
        content_type="application/json",
        headers=auth_headers(host),
    )

    body = client.post(
        f"/api/events/{created['id']}/reveal",
        {"reveal": False},
        content_type="application/json",
        headers=auth_headers(host),
    ).json()

    assert body["is_revealed"] is False
    assert body["revealed_at"] is None
    assert body["reveal_withheld"] is True


@pytest.mark.django_db
def test_reverting_holds_the_album_even_past_the_scheduled_time(client, host):
    """The interesting case. Simply clearing revealed_at would let a schedule
    that has already passed re-open the album on the very next request."""
    now = timezone.now()
    created = client.post(
        "/api/events",
        valid_payload(
            capture_starts_at=(now - timedelta(hours=3)).isoformat(),
            capture_ends_at=(now - timedelta(hours=2)).isoformat(),
            reveals_at=(now - timedelta(hours=1)).isoformat(),
        ),
        content_type="application/json",
        headers=auth_headers(host),
    ).json()
    assert created["is_revealed"] is True  # the schedule already fired

    reverted = client.post(
        f"/api/events/{created['id']}/reveal",
        {"reveal": False},
        content_type="application/json",
        headers=auth_headers(host),
    ).json()

    assert reverted["is_revealed"] is False
    # And the host's configured schedule survives untouched.
    assert reverted["reveals_at"] is not None


@pytest.mark.django_db
def test_revealing_again_after_a_revert_reopens(client, host):
    created = client.post(
        "/api/events", valid_payload(), content_type="application/json", headers=auth_headers(host)
    ).json()

    for reveal in (True, False, True):
        body = client.post(
            f"/api/events/{created['id']}/reveal",
            {"reveal": reveal},
            content_type="application/json",
            headers=auth_headers(host),
        ).json()

    assert body["is_revealed"] is True
    assert body["reveal_withheld"] is False


@pytest.mark.django_db
def test_another_host_cannot_reveal_your_event(client, host, other_host):
    created = client.post(
        "/api/events", valid_payload(), content_type="application/json", headers=auth_headers(host)
    ).json()

    response = client.post(
        f"/api/events/{created['id']}/reveal",
        {"reveal": True},
        content_type="application/json",
        headers=auth_headers(other_host),
    )
    assert response.status_code == 404


# --- Album ------------------------------------------------------------------


def _make_event_with_photos(host: User) -> Event:
    """An event with photos from two guests, plus non-photograph slots that
    the album must never surface."""
    from apps.media.models import MediaAsset, ModerationStatus, ProcessingStatus
    from apps.participants.models import Participant

    event = Event.objects.create(host=host, title="Anna & Ben", timezone_name="Europe/Berlin")
    anna = Participant.objects.create(
        event=event, display_name="Anna", anonymous_session_id="a1", shot_limit=20
    )
    ben = Participant.objects.create(
        event=event, display_name="Ben", anonymous_session_id="b1", shot_limit=20
    )

    MediaAsset.objects.create(
        event=event, participant=anna, storage_key="a.jpg", processing_status=ProcessingStatus.READY
    )
    MediaAsset.objects.create(
        event=event, participant=ben, storage_key="b.jpg", processing_status=ProcessingStatus.UPLOADED
    )
    # Must be excluded: a slot that never landed, and a removed photo.
    MediaAsset.objects.create(
        event=event, participant=anna, storage_key="c.jpg", processing_status=ProcessingStatus.RESERVED
    )
    MediaAsset.objects.create(
        event=event,
        participant=ben,
        storage_key="d.jpg",
        processing_status=ProcessingStatus.READY,
        moderation_status=ModerationStatus.REMOVED,
    )
    return event


@pytest.mark.django_db
def test_album_is_refused_until_revealed(client, host):
    """Reveal-gated: the album is the moment the host chose to share."""
    event = _make_event_with_photos(host)
    assert event.is_revealed is False

    response = client.get(f"/api/events/{event.id}/album", headers=auth_headers(host))
    assert response.status_code == 409


@pytest.mark.django_db
def test_album_returns_every_real_photo_once_revealed(client, host):
    event = _make_event_with_photos(host)
    event.reveal_withheld = False
    event.revealed_at = timezone.now()
    event.save(update_fields=["reveal_withheld", "revealed_at"])

    response = client.get(f"/api/events/{event.id}/album", headers=auth_headers(host))
    assert response.status_code == 200

    photos = response.json()
    # Two real photographs; the reserved slot and the removed photo are gone.
    assert len(photos) == 2
    # Attribution is carried, and every photo has a URL.
    assert {p["photographer"] for p in photos} == {"Anna", "Ben"}
    assert all(p["url"] for p in photos)


@pytest.mark.django_db
def test_album_is_scoped_to_the_owner(client, host, other_host):
    event = _make_event_with_photos(host)
    event.reveal_withheld = False
    event.revealed_at = timezone.now()
    event.save(update_fields=["reveal_withheld", "revealed_at"])

    response = client.get(f"/api/events/{event.id}/album", headers=auth_headers(other_host))
    assert response.status_code == 404
