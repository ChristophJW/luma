import secrets
import uuid

from django.db import models
from django.utils import timezone


def generate_join_code() -> str:
    """Short, non-guessable, unambiguous join code.

    The alphabet excludes 0/O and 1/I/L because this code gets printed on a
    table card and read aloud across a noisy room. 6 characters from a
    30-symbol alphabet is ~729M combinations, which is fine given rate
    limiting on join attempts (CHECKLIST.md §10).
    """
    alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
    return "".join(secrets.choice(alphabet) for _ in range(6))


class EventStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"
    CAPTURING = "capturing", "Capturing"
    WAITING = "waiting", "Waiting for reveal"
    REVEALED = "revealed", "Revealed"
    ARCHIVED = "archived", "Archived"


class VisibilityMode(models.TextChoices):
    IMMEDIATE = "immediate", "Photos visible immediately"
    OWN_ONLY = "own_only", "Guests see only their own photos"
    HOST_ONLY = "host_only", "Host sees everything, guests wait"
    HIDDEN = "hidden", "Nobody sees anything until reveal"


class CaptureMode(models.TextChoices):
    CAMERA_ONLY = "camera_only", "Camera only"
    CAMERA_AND_UPLOAD = "camera_and_upload", "Camera and existing photos"
    UPLOAD_ONLY = "upload_only", "Upload only"


class Event(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    title = models.CharField(max_length=200)
    event_type = models.CharField(max_length=50, default="wedding")
    status = models.CharField(max_length=20, choices=EventStatus, default=EventStatus.DRAFT)

    # Join
    public_slug = models.SlugField(max_length=64, unique=True)
    join_code = models.CharField(max_length=16, unique=True, default=generate_join_code)

    # Timing. Stored in UTC; the host's timezone is kept so that "Sunday at
    # 12:00" renders correctly for everyone.
    timezone_name = models.CharField(max_length=64, default="Europe/Berlin")
    capture_starts_at = models.DateTimeField(null=True, blank=True)
    capture_ends_at = models.DateTimeField(null=True, blank=True)
    reveals_at = models.DateTimeField(null=True, blank=True)
    revealed_at = models.DateTimeField(null=True, blank=True)

    # Limits
    guest_capacity = models.PositiveIntegerField(default=5)
    shots_per_guest = models.PositiveIntegerField(default=20)

    # Behaviour
    visibility_mode = models.CharField(
        max_length=20, choices=VisibilityMode, default=VisibilityMode.HIDDEN
    )
    capture_mode = models.CharField(
        max_length=20, choices=CaptureMode, default=CaptureMode.CAMERA_ONLY
    )
    guest_downloads_enabled = models.BooleanField(default=True)

    # Face lookup is off by default and must be enabled deliberately per event.
    # An event involving minors disables it outright (CONCEPT.md §8).
    face_lookup_enabled = models.BooleanField(default=False)
    involves_minors = models.BooleanField(default=False)

    retention_expires_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # Enforced in the database, not only in application code — this is
            # a legal constraint, not a preference.
            models.CheckConstraint(
                condition=models.Q(involves_minors=False) | models.Q(face_lookup_enabled=False),
                name="no_face_lookup_when_minors_involved",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.join_code})"

    def save(self, *args, **kwargs):
        if self.involves_minors:
            self.face_lookup_enabled = False
        super().save(*args, **kwargs)

    @property
    def is_capture_open(self) -> bool:
        now = timezone.now()
        if self.capture_starts_at and now < self.capture_starts_at:
            return False
        if self.capture_ends_at and now > self.capture_ends_at:
            return False
        return self.status in {EventStatus.PUBLISHED, EventStatus.CAPTURING}

    @property
    def is_revealed(self) -> bool:
        if self.revealed_at:
            return True
        return bool(self.reveals_at and timezone.now() >= self.reveals_at)
