"""The guest capture endpoints, over HTTP."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import AuthSession, User
from apps.accounts.services import hash_token
from apps.events.models import Event, EventStatus


@pytest.fixture
def event(db) -> Event:
    now = timezone.now()
    return Event.objects.create(
        title="Anna & Ben",
        public_slug="anna-ben",
        join_code="LUMA01",
        status=EventStatus.PUBLISHED,
        capture_starts_at=now - timedelta(hours=1),
        capture_ends_at=now + timedelta(hours=6),
        guest_capacity=10,
        shots_per_guest=2,
    )


def join(client, code="LUMA01", name="Tante Erika", headers=None):
    return client.post(
        f"/api/guest/join/{code}",
        {"display_name": name},
        content_type="application/json",
        headers=headers or {},
    )


def camera(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.django_db
def test_full_capture_round_trip(client, event):
    """Join, reserve, confirm — the loop the camera actually walks."""
    joined = join(client, name="Christoph")
    assert joined.status_code == 201
    body = joined.json()
    token = body["token"]
    assert body["participant"]["shots_remaining"] == 2

    reserved = client.post(
        "/api/guest/shots/reserve",
        {"content_type": "image/jpeg"},
        content_type="application/json",
        headers=camera(token),
    )
    assert reserved.status_code == 201
    slot = reserved.json()
    assert slot["upload_url"].startswith("http")
    assert slot["shots_remaining"] == 1

    confirmed = client.post(
        f"/api/guest/shots/{slot['media_id']}/confirm",
        {"byte_size": 2048},
        content_type="application/json",
        headers=camera(token),
    )
    assert confirmed.status_code == 200
    assert confirmed.json() == {
        "media_id": slot["media_id"],
        "shots_committed": 1,
        "shots_remaining": 1,
    }


@pytest.mark.django_db
def test_capture_endpoints_require_a_camera_session(client, event):
    assert client.get("/api/guest/me").status_code == 401
    assert (
        client.post("/api/guest/shots/reserve", {}, content_type="application/json").status_code
        == 401
    )


@pytest.mark.django_db
def test_running_out_of_shots_is_a_409(client, event):
    token = join(client).json()["token"]

    for _ in range(2):
        assert (
            client.post(
                "/api/guest/shots/reserve",
                {"content_type": "image/jpeg"},
                content_type="application/json",
                headers=camera(token),
            ).status_code
            == 201
        )

    out = client.post(
        "/api/guest/shots/reserve",
        {"content_type": "image/jpeg"},
        content_type="application/json",
        headers=camera(token),
    )
    assert out.status_code == 409
    assert "the roll" in out.content.decode()


@pytest.mark.django_db
def test_a_signed_in_host_joins_their_own_event_as_themselves(client, event):
    """The account header links the participation instead of creating an
    anonymous second identity."""
    christoph = User.objects.create_user(email="host@example.com")
    event.host = christoph
    event.save()

    token = "host-session-token"
    AuthSession.objects.create(
        user=christoph,
        token_hash=hash_token(token),
        expires_at=timezone.now() + timedelta(days=1),
    )

    first = join(client, name="Christoph", headers={"X-Luma-Account": token})
    second = join(client, name="Christoph", headers={"X-Luma-Account": token})

    assert first.json()["created"] is True
    assert second.json()["created"] is False
    assert event.participants.count() == 1
    assert event.participants.get().user == christoph


@pytest.mark.django_db
def test_joining_an_unknown_code_is_a_404(client, event):
    assert join(client, code="NOPE99").status_code == 404


@pytest.mark.django_db
def test_abandoning_hands_the_shot_back(client, event):
    token = join(client).json()["token"]
    slot = client.post(
        "/api/guest/shots/reserve",
        {"content_type": "image/jpeg"},
        content_type="application/json",
        headers=camera(token),
    ).json()

    dropped = client.post(
        f"/api/guest/shots/{slot['media_id']}/abandon",
        {},
        content_type="application/json",
        headers=camera(token),
    )
    assert dropped.status_code == 204

    state = client.get("/api/guest/me", headers=camera(token)).json()
    assert state["shots_remaining"] == 2


# --- The guest's own gallery ------------------------------------------------


def take_photo(client, token):
    slot = client.post(
        "/api/guest/shots/reserve",
        {"content_type": "image/jpeg"},
        content_type="application/json",
        headers=camera(token),
    ).json()
    client.post(
        f"/api/guest/shots/{slot['media_id']}/confirm",
        {"byte_size": 100},
        content_type="application/json",
        headers=camera(token),
    )
    return slot["media_id"]


@pytest.mark.django_db
def test_gallery_returns_only_your_own_photos(client, event):
    mine = join(client, name="Mine").json()["token"]
    theirs = join(client, name="Theirs").json()["token"]

    my_photo = take_photo(client, mine)
    take_photo(client, theirs)

    photos = client.get("/api/guest/photos", headers=camera(mine)).json()
    assert [p["id"] for p in photos] == [my_photo]
    assert photos[0]["url"].startswith("http")


@pytest.mark.django_db
def test_gallery_is_visible_even_when_the_album_is_hidden(client, event):
    """Album visibility governs the *shared* album. A person's own roll is
    their own personal data, and Art. 17 erasure needs them to see it."""
    from apps.events.models import VisibilityMode

    event.visibility_mode = VisibilityMode.HIDDEN
    event.save()

    token = join(client).json()["token"]
    take_photo(client, token)

    assert len(client.get("/api/guest/photos", headers=camera(token)).json()) == 1


@pytest.mark.django_db
def test_deleting_removes_the_photo_but_never_returns_the_shot(client, event):
    """Handing the shot back would make delete-and-retake an unlimited roll."""
    token = join(client).json()["token"]
    media_id = take_photo(client, token)

    before = client.get("/api/guest/me", headers=camera(token)).json()
    assert before["shots_remaining"] == 1

    assert client.delete(f"/api/guest/photos/{media_id}", headers=camera(token)).status_code == 204

    assert client.get("/api/guest/photos", headers=camera(token)).json() == []
    after = client.get("/api/guest/me", headers=camera(token)).json()
    assert after["shots_remaining"] == 1
    assert after["shots_committed"] == 1


@pytest.mark.django_db
def test_deleting_twice_is_harmless(client, event):
    token = join(client).json()["token"]
    media_id = take_photo(client, token)

    for _ in range(2):
        assert (
            client.delete(f"/api/guest/photos/{media_id}", headers=camera(token)).status_code == 204
        )


@pytest.mark.django_db
def test_one_guest_cannot_delete_another_guests_photo(client, event):
    mine = join(client, name="Mine").json()["token"]
    theirs = join(client, name="Theirs").json()["token"]
    victim = take_photo(client, theirs)

    assert client.delete(f"/api/guest/photos/{victim}", headers=camera(mine)).status_code == 404
    assert len(client.get("/api/guest/photos", headers=camera(theirs)).json()) == 1


@pytest.mark.django_db
def test_photo_urls_are_stable_across_requests(client, event):
    """SigV4 embeds the signing timestamp, so a freshly generated URL differs
    every second — which silently defeats every URL-keyed cache in the chain.
    The signature is cached so a gallery does not re-download on every open."""
    from django.core.cache import cache

    cache.clear()
    token = join(client).json()["token"]
    take_photo(client, token)

    first = client.get("/api/guest/photos", headers=camera(token)).json()
    second = client.get("/api/guest/photos", headers=camera(token)).json()

    assert first[0]["url"] == second[0]["url"]
