"""Login codes and sessions.

Kept separate from the User model purely for readability; both live in the
accounts app and share its migrations.
"""

import uuid

from django.db import models


class LoginCode(models.Model):
    """A one-time code sent to an email address.

    The plaintext code is never stored — only a hash. A leaked database must
    not hand an attacker a set of working codes.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Stored rather than FK'd to User, because requesting a code must not
    # reveal whether an account exists. The user is resolved at verify time.
    email = models.EmailField(db_index=True)
    code_hash = models.CharField(max_length=255)

    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    attempts = models.PositiveSmallIntegerField(default=0)

    # Metadata for abuse investigation. IPs are hashed — see CONCEPT.md,
    # Privacy and legal design.
    ip_hash = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["email", "-created_at"])]

    def __str__(self) -> str:
        return f"code for {self.email}"


class AuthSession(models.Model):
    """A signed-in session.

    A bearer token rather than a cookie, because the host app is one codebase
    across native and web and cookies behave differently on each. Only the
    hash is stored.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="sessions")

    token_hash = models.CharField(max_length=64, unique=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    user_agent = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"session for {self.user_id}"
