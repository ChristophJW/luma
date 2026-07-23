import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Participant(models.Model):
    """One person's role in one event.

    There is a single account type in Luma. Somebody who hosts their own
    wedding and attends a friend's is one User with two different roles, and
    the role belongs to the event rather than to the person.

    `user` is deliberately nullable: an account is never required to
    participate. A guest captures anonymously and may claim the participation
    afterwards, or — if already signed in when they scan the QR code — joins
    in one tap with `user` set immediately.

    See CONCEPT.md, "One account, roles per event".
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="participants")

    # Null while anonymous. Setting this must never be a precondition for
    # capturing — see DESIGN.md non-negotiable #1.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="participations",
    )

    display_name = models.CharField(max_length=80)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)

    # Opaque identifier stored in a signed cookie and mirrored to local storage.
    anonymous_session_id = models.CharField(max_length=64, unique=True, db_index=True)

    # Shot accounting. `shots_committed` counts confirmed uploads;
    # `shots_reserved` counts outstanding upload slots. A shot is reserved
    # server-side BEFORE the pre-signed URL is issued and released if the
    # upload never confirms. Never trust a client-side counter.
    shot_limit = models.PositiveIntegerField()
    shots_committed = models.PositiveIntegerField(default=0)
    shots_reserved = models.PositiveIntegerField(default=0)

    consent_version = models.CharField(max_length=32, default="")

    joined_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["joined_at"]
        indexes = [
            models.Index(fields=["event", "joined_at"]),
            # "My events" reads by user across every event they attended.
            models.Index(fields=["user", "-joined_at"]),
        ]
        constraints = [
            # One account joins an event once. Several participants per account
            # in the same event only happen across devices, and that is a merge
            # to offer explicitly rather than a state to allow silently.
            models.UniqueConstraint(
                fields=["event", "user"],
                condition=models.Q(user__isnull=False),
                name="one_participation_per_user_per_event",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.display_name} @ {self.event_id}"

    @property
    def shots_remaining(self) -> int:
        return max(0, self.shot_limit - self.shots_committed - self.shots_reserved)


class CameraSession(models.Model):
    """A browser holding a camera for one participant.

    A bearer token rather than only a cookie: the guest camera must survive a
    cookie being dropped, so the token is also mirrored into local storage as
    a recovery path (CONCEPT.md §3). Only the hash is stored.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participant = models.ForeignKey(
        Participant, on_delete=models.CASCADE, related_name="camera_sessions"
    )

    token_hash = models.CharField(max_length=64, unique=True, db_index=True)

    user_agent = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"camera session for {self.participant_id}"

    @property
    def is_valid(self) -> bool:
        return self.expires_at > timezone.now()
