import uuid

from django.db import models


class Participant(models.Model):
    """A guest's participation in one event.

    Deliberately not a user account. An account (AttendeeAccount, later) can
    claim participants after the fact, but participation never requires one.
    See CONCEPT.md, Guest identity.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="participants")

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
        indexes = [models.Index(fields=["event", "joined_at"])]

    def __str__(self) -> str:
        return f"{self.display_name} @ {self.event_id}"

    @property
    def shots_remaining(self) -> int:
        return max(0, self.shot_limit - self.shots_committed - self.shots_reserved)
