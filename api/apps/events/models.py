import secrets
import uuid

from django.conf import settings
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


class Theme(models.TextChoices):
    """Film treatments.

    Evocative and generic, never a trademarked film stock — DESIGN.md §11.
    A themes table with per-filter configuration comes later; while there is
    one fixed set, choices keep it simple and keep the guest bundle small.
    """

    NOON = "noon", "Noon"
    GOLDEN = "golden", "Golden"
    TUNGSTEN = "tungsten", "Tungsten"
    SILVER = "silver", "Silver"
    SAFELIGHT = "safelight", "Safelight"
    POLAR = "polar", "Polar"


class Event(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # The account that created and pays for this event. Hosting is ownership of
    # an event, not a property of the person — the same User is a Participant
    # in somebody else's event. See CONCEPT.md, "One account, roles per event".
    #
    # PROTECT rather than CASCADE or SET_NULL: an event holds photographs
    # belonging to people who are not the host, so deleting a host account must
    # not silently destroy or orphan them. Account deletion has to offer
    # transfer-or-delete first (CHECKLIST.md §13).
    host = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="hosted_events",
    )

    title = models.CharField(max_length=200)
    event_type = models.CharField(max_length=50, default="wedding")
    # Optional, shown on the guest cover screen. Free text rather than a place
    # lookup — a venue name is what a host actually types.
    location = models.CharField(max_length=200, blank=True)
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

    # An explicit hold, so a host can close the album again after opening it
    # early. Without this, reverting would mean clearing revealed_at — and if
    # the scheduled time had already passed the album would simply re-open on
    # the next request. A hold reverses the decision without destroying the
    # schedule the host configured.
    reveal_withheld = models.BooleanField(default=False)

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
    theme = models.CharField(max_length=20, choices=Theme, default=Theme.NOON)

    # The reveal is a designed moment, not a gallery becoming clickable —
    # DESIGN.md §8. A host can turn the opening sequence off.
    highlight_reel_enabled = models.BooleanField(default=True)

    # Face lookup is off by default and must be enabled deliberately per event.
    # An event involving minors disables it outright (CONCEPT.md §8).
    face_lookup_enabled = models.BooleanField(default=False)
    involves_minors = models.BooleanField(default=False)

    # Blur children's faces in everything shown or exported.
    #
    # Deliberately NOT the same thing as face lookup, and deliberately not
    # blocked by involves_minors:
    #
    #   lookup  identifies a person, stores a biometric template, and matches
    #           it against a reference the subject supplied. Needs that
    #           subject's explicit consent, so it is forbidden for minors.
    #   blur    detects a face region and estimates whether it belongs to a
    #           child, then destroys it. Nothing is stored, nothing is
    #           matched, nobody is searched for.
    #
    # One finds people; the other hides them. Art. 25 data protection by
    # design favours the second. It still involves inference from a face, so
    # it needs its own DPIA section and its own line in the privacy policy.
    blur_child_faces = models.BooleanField(default=False)

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
            # Blurring children only means something at an event where
            # children are present, and that is what involves_minors declares.
            models.CheckConstraint(
                condition=models.Q(blur_child_faces=False) | models.Q(involves_minors=True),
                name="blur_child_faces_requires_minors_declared",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.join_code})"

    def save(self, *args, **kwargs):
        if self.involves_minors:
            self.face_lookup_enabled = False
        else:
            # Nothing to blur if the host has not said children will be there.
            self.blur_child_faces = False
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
        # A hold beats everything, including a schedule that has passed.
        if self.reveal_withheld:
            return False
        if self.revealed_at:
            return True
        return bool(self.reveals_at and timezone.now() >= self.reveals_at)
