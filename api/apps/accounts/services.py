"""Authentication logic.

Kept out of the API layer so the rules are testable in isolation and the
endpoints stay thin.

The properties that matter, all from CONCEPT.md §4 and CHECKLIST.md §10:

* requesting a code never reveals whether an account exists
* the plaintext code is never stored
* comparison is constant-time
* a code is single-use, short-lived, and attempt-limited
* rate limits and cooldowns replace CAPTCHA, so the happy path stays clean
"""

import hashlib
import secrets
from dataclasses import dataclass

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from .constants import (
    CODE_LENGTH,
    CODE_TTL,
    MAX_CODES_PER_EMAIL_PER_HOUR,
    MAX_CODES_PER_IP_PER_HOUR,
    RESEND_COOLDOWN,
    SESSION_TTL,
)
from .models import AuthSession, LoginCode, User


class RateLimited(Exception):
    """Raised when a caller must wait. `retry_after` is in seconds."""

    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        super().__init__(f"Rate limited, retry after {retry_after}s")


@dataclass
class VerifyResult:
    token: str
    user: User
    created: bool


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_ip(ip: str | None) -> str:
    """IPs are never stored raw. Salted with SECRET_KEY so hashes are not
    portable across environments and cannot be reversed by dictionary."""
    if not ip:
        return ""
    return hashlib.sha256(f"{settings.SECRET_KEY}{ip}".encode()).hexdigest()


def hash_token(token: str) -> str:
    """Session tokens are 256 bits of entropy, so a fast hash is appropriate —
    there is nothing to brute-force. Codes are different; they use a slow
    password hasher because 6 digits is a small search space."""
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_code() -> str:
    """Uniformly random, zero-padded. Leading zeros are meaningful."""
    return f"{secrets.randbelow(10**CODE_LENGTH):0{CODE_LENGTH}d}"


def _check_rate_limits(email: str, ip_hash: str) -> None:
    """Raise RateLimited if this request should be refused.

    Deliberately checked before any database write, so a flood costs nothing.
    """
    # The cooldown stores the epoch second it expires, not a flag, so the API
    # can return an accurate countdown. DESIGN.md §12 requires the wait to be
    # visible — "try again later" with no number reads as broken.
    cooldown_until = cache.get(f"auth:cooldown:{email}")
    if cooldown_until:
        remaining = int(cooldown_until - timezone.now().timestamp())
        if remaining > 0:
            raise RateLimited(retry_after=remaining)

    hourly_key = f"auth:count:email:{email}"
    if (cache.get(hourly_key) or 0) >= MAX_CODES_PER_EMAIL_PER_HOUR:
        raise RateLimited(retry_after=3600)

    if ip_hash:
        ip_key = f"auth:count:ip:{ip_hash}"
        if (cache.get(ip_key) or 0) >= MAX_CODES_PER_IP_PER_HOUR:
            raise RateLimited(retry_after=3600)


def _record_send(email: str, ip_hash: str) -> None:
    cooldown_seconds = int(RESEND_COOLDOWN.total_seconds())
    cache.set(
        f"auth:cooldown:{email}",
        timezone.now().timestamp() + cooldown_seconds,
        timeout=cooldown_seconds,
    )

    hourly_key = f"auth:count:email:{email}"
    cache.set(hourly_key, (cache.get(hourly_key) or 0) + 1, timeout=3600)

    if ip_hash:
        ip_key = f"auth:count:ip:{ip_hash}"
        cache.set(ip_key, (cache.get(ip_key) or 0) + 1, timeout=3600)


@transaction.atomic
def issue_login_code(
    email: str, *, ip: str | None = None, user_agent: str = ""
) -> tuple[LoginCode, str]:
    """Create and store a code, returning it in plaintext exactly once.

    The caller is responsible for delivering it. Nothing about the return
    value tells you whether an account exists — that is the point.
    """
    email = normalize_email(email)
    ip_digest = hash_ip(ip)

    _check_rate_limits(email, ip_digest)

    # Any earlier code for this address is dead the moment a new one is sent,
    # so a resend cannot leave two working codes in circulation.
    LoginCode.objects.filter(email=email, consumed_at__isnull=True).update(
        consumed_at=timezone.now()
    )

    code = _generate_code()
    login_code = LoginCode.objects.create(
        email=email,
        code_hash=make_password(code),
        expires_at=timezone.now() + CODE_TTL,
        ip_hash=ip_digest,
        user_agent=user_agent[:300],
    )

    _record_send(email, ip_digest)
    return login_code, code


def verify_login_code(email: str, code: str, *, user_agent: str = "") -> VerifyResult | None:
    """Verify a code and sign the person in, creating the account if new.

    Returns None for every failure — wrong code, expired, already used, too
    many attempts. The caller must not distinguish between these to the client
    beyond what the design calls for, and must never reveal account existence.
    """
    email = normalize_email(email)
    code = code.strip().replace(" ", "")

    with transaction.atomic():
        login_code = (
            LoginCode.objects.select_for_update()
            .filter(email=email, consumed_at__isnull=True)
            .order_by("-created_at")
            .first()
        )

        if login_code is None or not login_code.is_usable:
            return None

        # Count the attempt before checking, so a crash mid-verify cannot be
        # used to get unlimited guesses.
        login_code.attempts += 1
        login_code.save(update_fields=["attempts"])

        if not check_password(code, login_code.code_hash):
            return None

        login_code.consumed_at = timezone.now()
        login_code.save(update_fields=["consumed_at"])

        user, created = User.objects.get_or_create(email=email)

        # Receiving the code at this address *is* the verification. There is
        # no separate confirmation step (CONCEPT.md §4).
        now = timezone.now()
        if user.email_verified_at is None:
            user.email_verified_at = now
        user.last_login = now
        user.save(update_fields=["email_verified_at", "last_login"])

        token = secrets.token_urlsafe(32)
        AuthSession.objects.create(
            user=user,
            token_hash=hash_token(token),
            expires_at=now + SESSION_TTL,
            user_agent=user_agent[:300],
        )

    # Signing in clears the cooldown — a successful login should not leave the
    # person rate-limited if they need another code later.
    cache.delete(f"auth:cooldown:{email}")

    return VerifyResult(token=token, user=user, created=created)


def resolve_session(token: str) -> User | None:
    session = (
        AuthSession.objects.select_related("user").filter(token_hash=hash_token(token)).first()
    )
    if session is None or not session.is_valid or not session.user.is_active:
        return None

    session.save(update_fields=["last_used_at"])
    return session.user


def revoke_session(token: str) -> None:
    AuthSession.objects.filter(token_hash=hash_token(token), revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )
