import uuid

from django.db import models


class ProcessingStatus(models.TextChoices):
    RESERVED = "reserved", "Slot reserved, not yet uploaded"
    UPLOADED = "uploaded", "Uploaded, awaiting processing"
    PROCESSING = "processing", "Processing"
    READY = "ready", "Ready"
    FAILED = "failed", "Failed"
    EXPIRED = "expired", "Reservation expired"


class ModerationStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REMOVED = "removed", "Removed"


class MediaAsset(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="media")
    participant = models.ForeignKey(
        "participants.Participant", on_delete=models.SET_NULL, null=True, related_name="media"
    )

    storage_key = models.CharField(max_length=512)
    # The child-face-blurred derivative, written by the faces Celery task. Set
    # only once blurring has actually run; the album keys visibility off its
    # presence, so an original can never be served in a blur-on event.
    blurred_storage_key = models.CharField(max_length=512, blank=True, default="")
    mime_type = models.CharField(max_length=64, blank=True)
    byte_size = models.BigIntegerField(null=True, blank=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    checksum = models.CharField(max_length=64, blank=True, db_index=True)

    processing_status = models.CharField(
        max_length=20, choices=ProcessingStatus, default=ProcessingStatus.RESERVED
    )
    moderation_status = models.CharField(
        max_length=20, choices=ModerationStatus, default=ModerationStatus.APPROVED
    )

    captured_at = models.DateTimeField(null=True, blank=True)
    uploaded_at = models.DateTimeField(null=True, blank=True)
    # A reservation that is never confirmed must release its shot.
    reservation_expires_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["event", "processing_status"]),
            models.Index(fields=["event", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.id} ({self.processing_status})"
