"""Auth behaviour, focused on the properties that must not regress.

These are security invariants, not feature tests — each one corresponds to a
rule in CONCEPT.md §4 or CHECKLIST.md §10.
"""

import pytest
from django.core import mail
from django.core.cache import cache
from django.utils import timezone

from apps.accounts.constants import MAX_CODE_ATTEMPTS
from apps.accounts.emails import render_login_code
from apps.accounts.models import AuthSession, LoginCode, User
from apps.accounts.services import (
    RateLimited,
    issue_login_code,
    resolve_session,
    revoke_session,
    verify_login_code,
    verify_login_link,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


# --- Code storage and verification ----------------------------------------


@pytest.mark.django_db
def test_plaintext_code_is_never_stored():
    """A leaked database must not hand an attacker working codes."""
    _, code, _ = issue_login_code("host@example.com")
    stored = LoginCode.objects.get()
    assert code not in stored.code_hash
    assert stored.code_hash != code
    # Django's hasher format, i.e. genuinely hashed rather than encoded.
    assert stored.code_hash.count("$") >= 3


@pytest.mark.django_db
def test_verifying_creates_the_account_on_first_sign_in():
    """One entry point — nobody picks between 'register' and 'log in'."""
    assert not User.objects.filter(email="new@example.com").exists()

    _, code, _ = issue_login_code("new@example.com")
    result = verify_login_code("new@example.com", code)

    assert result is not None
    assert result.created is True
    assert result.user.email == "new@example.com"
    # Receiving the code at the address is the verification.
    assert result.user.email_verified_at is not None


@pytest.mark.django_db
def test_returning_host_is_not_duplicated():
    for expected_created in (True, False):
        cache.clear()
        _, code, _ = issue_login_code("host@example.com")
        result = verify_login_code("host@example.com", code)
        assert result is not None
        assert result.created is expected_created

    assert User.objects.filter(email="host@example.com").count() == 1


@pytest.mark.django_db
def test_email_is_normalised():
    _, code, _ = issue_login_code("  Host@Example.COM ")
    result = verify_login_code("host@example.com", code)
    assert result is not None
    assert result.user.email == "host@example.com"


@pytest.mark.django_db
def test_code_is_single_use():
    _, code, _ = issue_login_code("host@example.com")
    assert verify_login_code("host@example.com", code) is not None
    assert verify_login_code("host@example.com", code) is None


@pytest.mark.django_db
def test_expired_code_is_rejected():
    login_code, code, _ = issue_login_code("host@example.com")
    login_code.expires_at = timezone.now() - timezone.timedelta(seconds=1)
    login_code.save(update_fields=["expires_at"])

    assert verify_login_code("host@example.com", code) is None


@pytest.mark.django_db
def test_wrong_code_is_rejected_and_counts_an_attempt():
    _, code, _ = issue_login_code("host@example.com")
    wrong = "000000" if code != "000000" else "111111"

    assert verify_login_code("host@example.com", wrong) is None
    assert LoginCode.objects.get().attempts == 1


@pytest.mark.django_db
def test_attempts_are_capped():
    """Brute force is bounded — 6 digits is a small search space."""
    _, code, _ = issue_login_code("host@example.com")
    wrong = "000000" if code != "000000" else "111111"

    for _ in range(MAX_CODE_ATTEMPTS):
        verify_login_code("host@example.com", wrong)

    # Even the correct code no longer works once the cap is reached.
    assert verify_login_code("host@example.com", code) is None


@pytest.mark.django_db
def test_requesting_a_new_code_invalidates_the_previous_one():
    """A resend must not leave two working codes in circulation."""
    _, first, _ = issue_login_code("host@example.com")
    cache.clear()  # bypass the resend cooldown
    _, second, _ = issue_login_code("host@example.com")

    assert verify_login_code("host@example.com", first) is None
    assert verify_login_code("host@example.com", second) is not None


@pytest.mark.django_db
def test_code_for_one_address_does_not_work_for_another():
    _, code, _ = issue_login_code("a@example.com")
    assert verify_login_code("b@example.com", code) is None


# --- Magic link ------------------------------------------------------------


@pytest.mark.django_db
def test_magic_link_signs_in_and_creates_the_account():
    """The link is the no-typing counterpart to the code — same outcome."""
    assert not User.objects.filter(email="new@example.com").exists()

    _, _, link_token = issue_login_code("new@example.com")
    result = verify_login_link(link_token)

    assert result is not None
    assert result.created is True
    assert result.user.email == "new@example.com"
    assert result.user.email_verified_at is not None


@pytest.mark.django_db
def test_link_token_is_never_stored_raw():
    """A leaked database must not hand an attacker working sign-in links."""
    _, _, link_token = issue_login_code("host@example.com")
    stored = LoginCode.objects.get()
    assert link_token not in stored.link_token_hash
    assert stored.link_token_hash and stored.link_token_hash != link_token


@pytest.mark.django_db
def test_magic_link_is_single_use():
    _, _, link_token = issue_login_code("host@example.com")
    assert verify_login_link(link_token) is not None
    assert verify_login_link(link_token) is None


@pytest.mark.django_db
def test_using_the_code_also_burns_the_link():
    """One row, one arrival. Verifying either way consumes the whole thing —
    a used code must not leave a still-live link behind."""
    _, code, link_token = issue_login_code("host@example.com")
    assert verify_login_code("host@example.com", code) is not None
    assert verify_login_link(link_token) is None


@pytest.mark.django_db
def test_expired_magic_link_is_rejected():
    login_code, _, link_token = issue_login_code("host@example.com")
    login_code.expires_at = timezone.now() - timezone.timedelta(seconds=1)
    login_code.save(update_fields=["expires_at"])

    assert verify_login_link(link_token) is None


@pytest.mark.django_db
def test_unknown_or_empty_link_token_is_rejected():
    assert verify_login_link("not-a-real-token") is None
    assert verify_login_link("") is None


@pytest.mark.django_db
def test_verify_link_endpoint_signs_in(client):
    _, _, link_token = issue_login_code("host@example.com")

    response = client.post(
        "/api/auth/verify-link",
        {"token": link_token},
        content_type="application/json",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == "host@example.com"
    assert resolve_session(body["token"]) is not None


@pytest.mark.django_db
def test_request_code_email_carries_a_magic_link(client, settings):
    settings.HOST_BASE_URL = "https://app.luma.de"
    response = client.post(
        "/api/auth/request-code",
        {"email": "host@example.com"},
        content_type="application/json",
    )
    assert response.status_code == 200

    # The link points at the host app with a magic token, and it actually works.
    body = mail.outbox[0].body
    assert "https://app.luma.de/?magic=" in body
    token = body.split("?magic=")[1].split()[0]
    assert verify_login_link(token) is not None


# --- Rate limiting ---------------------------------------------------------


@pytest.mark.django_db
def test_resend_cooldown_is_enforced_with_a_real_countdown():
    """DESIGN.md §12: the wait must be visible, so it must be a number."""
    issue_login_code("host@example.com")

    with pytest.raises(RateLimited) as excinfo:
        issue_login_code("host@example.com")

    assert 0 < excinfo.value.retry_after <= 60


@pytest.mark.django_db
def test_hourly_limit_per_email():
    from apps.accounts.constants import MAX_CODES_PER_EMAIL_PER_HOUR

    for _ in range(MAX_CODES_PER_EMAIL_PER_HOUR):
        cache.delete("auth:cooldown:host@example.com")
        issue_login_code("host@example.com")

    cache.delete("auth:cooldown:host@example.com")
    with pytest.raises(RateLimited):
        issue_login_code("host@example.com")


@pytest.mark.django_db
def test_ip_is_hashed_never_stored_raw():
    issue_login_code("host@example.com", ip="203.0.113.7")
    stored = LoginCode.objects.get()
    assert stored.ip_hash
    assert "203.0.113.7" not in stored.ip_hash


# --- Sessions --------------------------------------------------------------


@pytest.mark.django_db
def test_session_token_is_stored_only_as_a_hash():
    _, code, _ = issue_login_code("host@example.com")
    result = verify_login_code("host@example.com", code)
    assert result is not None

    session = AuthSession.objects.get()
    assert result.token not in session.token_hash
    assert resolve_session(result.token) == result.user


@pytest.mark.django_db
def test_revoked_session_stops_resolving():
    _, code, _ = issue_login_code("host@example.com")
    result = verify_login_code("host@example.com", code)
    assert result is not None

    revoke_session(result.token)
    assert resolve_session(result.token) is None


@pytest.mark.django_db
def test_unknown_token_resolves_to_nothing():
    assert resolve_session("not-a-real-token") is None


# --- API surface -----------------------------------------------------------


@pytest.mark.django_db
def test_request_code_response_is_identical_for_known_and_unknown_addresses(client):
    """No account enumeration. Same status, same body, either way."""
    User.objects.create_user(email="known@example.com")

    known = client.post(
        "/api/auth/request-code",
        {"email": "known@example.com"},
        content_type="application/json",
    )
    cache.clear()
    unknown = client.post(
        "/api/auth/request-code",
        {"email": "unknown@example.com"},
        content_type="application/json",
    )

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()


@pytest.mark.django_db
def test_request_code_sends_an_email_containing_the_code(client):
    response = client.post(
        "/api/auth/request-code",
        {"email": "host@example.com"},
        content_type="application/json",
    )
    assert response.status_code == 200
    assert len(mail.outbox) == 1

    # The code must be readable in a notification preview, so it belongs in
    # the subject as well as the body.
    body = mail.outbox[0].body
    assert any(chunk.isdigit() and len(chunk) == 6 for chunk in body.split())


def test_login_code_email_is_multipart_and_self_contained():
    """The HTML part is a nicety; the plain-text part is the contract.

    Also guards the two things that break a code email in practice: an HTML
    part that does not actually contain the code, and an external asset that
    has to load before the code is readable.
    """
    subject, plain, html = render_login_code("123456")

    assert subject.startswith("123456")
    assert "    123456" in plain
    assert "123456" in html

    # No remote fetches: no images, no web fonts, no tracking pixel.
    for forbidden in ("<img", "http://", "https://", "@font-face", "url("):
        assert forbidden not in html


def test_login_code_email_is_written_in_german_when_asked():
    _, plain, html = render_login_code("123456", language="de-DE")

    assert "Dein Anmeldecode" in plain
    assert "du bist drin" in html


@pytest.mark.django_db
def test_me_requires_a_valid_token(client):
    assert client.get("/api/auth/me").status_code == 401

    _, code, _ = issue_login_code("host@example.com")
    result = verify_login_code("host@example.com", code)
    assert result is not None

    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {result.token}"})
    assert response.status_code == 200
    assert response.json()["email"] == "host@example.com"


@pytest.mark.django_db
def test_logout_revokes_the_session(client):
    _, code, _ = issue_login_code("host@example.com")
    result = verify_login_code("host@example.com", code)
    assert result is not None
    headers = {"Authorization": f"Bearer {result.token}"}

    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 401
