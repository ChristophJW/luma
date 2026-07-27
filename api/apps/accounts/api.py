"""Host authentication endpoints.

One entry point: the caller sends an email address and then a code. Nothing
here tells a caller whether an account already exists — the client cannot
know, and neither can an attacker. CONCEPT.md §4.
"""

import logging
from urllib.parse import quote

from django.conf import settings
from django.http import HttpRequest
from django.utils.translation import get_language_from_request
from ninja import Router, Schema, Status
from ninja.errors import HttpError
from ninja.security import HttpBearer
from pydantic import EmailStr, Field

from .constants import CODE_LENGTH, RESEND_COOLDOWN
from .emails import send_login_code
from .services import (
    RateLimited,
    issue_login_code,
    resolve_session,
    revoke_session,
    verify_login_code,
    verify_login_link,
)

logger = logging.getLogger(__name__)

router = Router()


class SessionAuth(HttpBearer):
    def authenticate(self, request: HttpRequest, token: str):
        user = resolve_session(token)
        if user is None:
            return None
        request.auth_token = token
        return user


session_auth = SessionAuth()


def _client_ip(request: HttpRequest) -> str | None:
    # Behind a reverse proxy this must read X-Forwarded-For, and the proxy must
    # be trusted to set it. Configure that when deploying (CHECKLIST.md §10).
    return request.META.get("REMOTE_ADDR")


# --- Request a code --------------------------------------------------------


class RequestCodeIn(Schema):
    email: EmailStr
    # Explicit wins; otherwise the Accept-Language header decides. A code that
    # arrives in the wrong language reads as a phishing attempt.
    language: str | None = None


class RequestCodeOut(Schema):
    # Always the same shape, whether or not the address has an account.
    sent: bool
    resend_available_in: int = Field(description="Seconds until a resend is allowed.")


@router.post("/request-code", response=RequestCodeOut, tags=["auth"], auth=None)
def request_code(request, payload: RequestCodeIn) -> RequestCodeOut:
    """Send a one-time code.

    Responds identically for known and unknown addresses. A caller must not be
    able to enumerate accounts by watching status codes or timing.
    """
    try:
        _, code, link_token = issue_login_code(
            payload.email,
            ip=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
    except RateLimited as limited:
        # 429 with a real number, so the client can show a countdown rather
        # than a vague "try again later".
        raise HttpError(429, f"Please wait {limited.retry_after} seconds.") from limited

    language = payload.language or get_language_from_request(request, check_path=False) or "en"

    link = f"{settings.HOST_BASE_URL.rstrip('/')}/?magic={quote(link_token)}"

    try:
        send_login_code(payload.email, code, link=link, language=language)
    except Exception:
        # Never leak delivery failure detail to the caller — it is another
        # enumeration channel. Log it and alert on it instead.
        logger.exception("Failed to send login code")
        raise HttpError(502, "We couldn't send the email. Please try again.") from None

    return RequestCodeOut(
        sent=True,
        resend_available_in=int(RESEND_COOLDOWN.total_seconds()),
    )


# --- Verify a code ---------------------------------------------------------


class VerifyCodeIn(Schema):
    email: EmailStr
    code: str = Field(min_length=CODE_LENGTH, max_length=CODE_LENGTH + 4)


class UserOut(Schema):
    id: str
    email: str
    display_name: str


class VerifyCodeOut(Schema):
    token: str
    user: UserOut
    created: bool = Field(description="True if this sign-in created the account.")


@router.post("/verify-code", response=VerifyCodeOut, tags=["auth"], auth=None)
def verify_code(request, payload: VerifyCodeIn) -> VerifyCodeOut:
    """Verify a code and sign in, creating the account if this is a new host.

    Every failure returns the same 400. The client shows one message; telling
    a caller *why* verification failed helps an attacker more than a user.
    """
    result = verify_login_code(
        payload.email,
        payload.code,
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
    )

    if result is None:
        raise HttpError(400, "That code didn't work. Check it, or ask for a new one.")

    return VerifyCodeOut(
        token=result.token,
        user=UserOut(
            id=str(result.user.id),
            email=result.user.email,
            display_name=result.user.display_name,
        ),
        created=result.created,
    )


# --- Verify a magic link ---------------------------------------------------


class VerifyLinkIn(Schema):
    token: str = Field(min_length=1)


@router.post("/verify-link", response=VerifyCodeOut, tags=["auth"], auth=None)
def verify_link(request, payload: VerifyLinkIn) -> VerifyCodeOut:
    """Verify a magic-link token and sign in — the no-typing counterpart to
    verify-code. Same single 400 on any failure."""
    result = verify_login_link(
        payload.token,
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
    )

    if result is None:
        raise HttpError(400, "That sign-in link didn't work. Ask for a new code.")

    return VerifyCodeOut(
        token=result.token,
        user=UserOut(
            id=str(result.user.id),
            email=result.user.email,
            display_name=result.user.display_name,
        ),
        created=result.created,
    )


# --- Session ---------------------------------------------------------------


@router.get("/me", response=UserOut, tags=["auth"], auth=session_auth)
def me(request) -> UserOut:
    user = request.auth
    return UserOut(id=str(user.id), email=user.email, display_name=user.display_name)


@router.post("/logout", response={204: None}, tags=["auth"], auth=session_auth)
def logout(request):
    revoke_session(request.auth_token)
    return Status(204, None)
