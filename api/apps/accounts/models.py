"""Host accounts.

Email is the identity. There is no username, and a password is optional —
sign-in is a one-time code or, later, a passkey. See CONCEPT.md §4.
"""

import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from .constants import MAX_CODE_ATTEMPTS


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra):
        if not email:
            raise ValueError("An email address is required.")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        # No password is the normal case — set_unusable_password() makes that
        # explicit rather than leaving an empty hash lying around.
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email: str, password: str | None = None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("is_active", True)
        if extra["is_staff"] is not True or extra["is_superuser"] is not True:
            raise ValueError("Superuser must have is_staff and is_superuser set.")
        return self._create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)

    # Optional. Sign-up asks for nothing but an email address; a host can add
    # a name later if they want one on their event pages.
    display_name = models.CharField(max_length=120, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    # Set the first time a code is successfully verified. Because the code is
    # delivered to the address, verifying it *is* the email verification —
    # there is no separate confirmation wall (CONCEPT.md §4).
    email_verified_at = models.DateTimeField(null=True, blank=True)

    date_joined = models.DateTimeField(default=timezone.now)
    last_login = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        ordering = ["-date_joined"]

    def __str__(self) -> str:
        return self.email


class LoginCode(models.Model):
    """A one-time code sent to an email address.

    The plaintext code is never stored — only a hash. A leaked database must
    not hand an attacker a set of working codes.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Stored as an address rather than an FK to User, because requesting a
    # code must not reveal whether an account exists. The user is resolved at
    # verify time, and created then if this is a new host.
    email = models.EmailField(db_index=True)
    code_hash = models.CharField(max_length=255)

    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    attempts = models.PositiveSmallIntegerField(default=0)

    # Metadata for abuse investigation. IPs are hashed, never stored raw —
    # see CONCEPT.md, Privacy and legal design.
    ip_hash = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["email", "-created_at"])]

    def __str__(self) -> str:
        return f"code for {self.email}"

    @property
    def is_usable(self) -> bool:
        return (
            self.consumed_at is None
            and self.expires_at > timezone.now()
            and self.attempts < MAX_CODE_ATTEMPTS
        )


class AuthSession(models.Model):
    """A signed-in session.

    A bearer token rather than a session cookie: the host app is one codebase
    across native and web, and cookies behave differently on each. Only the
    token hash is stored.
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

    @property
    def is_valid(self) -> bool:
        return self.revoked_at is None and self.expires_at > timezone.now()
