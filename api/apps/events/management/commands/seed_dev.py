"""Create a predictable local event so the guest camera has something to open.

Idempotent: re-running updates the same event rather than creating another.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.events.models import CaptureMode, Event, EventStatus, VisibilityMode


class Command(BaseCommand):
    help = "Seed a development event with a fixed join code (LUMA01)."

    def handle(self, *args, **options) -> None:
        now = timezone.now()
        event, created = Event.objects.update_or_create(
            join_code="LUMA01",
            defaults={
                "title": "Anna & Ben",
                "event_type": "wedding",
                "status": EventStatus.PUBLISHED,
                "public_slug": "anna-und-ben",
                "timezone_name": "Europe/Berlin",
                "capture_starts_at": now - timedelta(hours=1),
                "capture_ends_at": now + timedelta(days=1),
                "reveals_at": now + timedelta(days=2),
                "guest_capacity": 100,
                "shots_per_guest": 20,
                "visibility_mode": VisibilityMode.HIDDEN,
                "capture_mode": CaptureMode.CAMERA_ONLY,
            },
        )
        verb = "Created" if created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(f"{verb} event {event.title} — join code {event.join_code}")
        )
        self.stdout.write("  guest: http://127.0.0.1:5173/?code=LUMA01")
