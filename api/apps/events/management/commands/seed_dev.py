"""Seed a predictable local world.

Deliberately seeds two events with *different* hosts so the identity model is
exercised rather than assumed: the test account hosts one event and attends
another. See CONCEPT.md, "One account, roles per event".

Idempotent — re-running updates the same records rather than creating more.
"""

import uuid
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.events.models import CaptureMode, Event, EventStatus, VisibilityMode
from apps.participants.models import Participant

# example.com is reserved for documentation (RFC 2606) and passes email
# validation. Do NOT use .local or .test — they are special-use names and
# email-validator rejects them, which makes the seeded account unable to
# sign in through the real flow.
TEST_EMAIL = "host@example.com"
FRIEND_EMAIL = "friend@example.com"
DEV_PASSWORD = "luma-dev"  # noqa: S105 — local only, guarded by DEBUG below


class Command(BaseCommand):
    help = "Seed a development host account and two events."

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        if not settings.DEBUG:
            # This command creates an account with a known password. It must
            # never be reachable in a deployed environment.
            raise CommandError("seed_dev refuses to run with DEBUG=False.")

        now = timezone.now()

        # --- Accounts ------------------------------------------------------
        host, host_created = User.objects.get_or_create(
            email=TEST_EMAIL,
            defaults={"display_name": "Christoph", "email_verified_at": now},
        )
        # Superuser so the same account also opens /admin. Passwordless sign-in
        # works regardless; the password exists only for the admin form.
        host.is_staff = True
        host.is_superuser = True
        host.set_password(DEV_PASSWORD)
        host.save()

        friend, _ = User.objects.get_or_create(
            email=FRIEND_EMAIL,
            defaults={"display_name": "Mira", "email_verified_at": now},
        )

        # --- Event the test account HOSTS ----------------------------------
        own_event, _ = Event.objects.update_or_create(
            join_code="LUMA01",
            defaults={
                "host": host,
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

        # --- Event the test account ATTENDS --------------------------------
        friends_event, _ = Event.objects.update_or_create(
            join_code="LUMA02",
            defaults={
                "host": friend,
                "title": "Mira & Jonas",
                "event_type": "wedding",
                "public_slug": "mira-und-jonas",
                "timezone_name": "Europe/Berlin",
                "capture_starts_at": now - timedelta(days=30),
                "capture_ends_at": now - timedelta(days=29),
                "reveals_at": now - timedelta(days=28),
                "revealed_at": now - timedelta(days=28),
                "status": EventStatus.REVEALED,
                "guest_capacity": 50,
                "shots_per_guest": 15,
                "visibility_mode": VisibilityMode.HIDDEN,
                "capture_mode": CaptureMode.CAMERA_ONLY,
            },
        )

        participation, _ = Participant.objects.get_or_create(
            event=friends_event,
            user=host,
            defaults={
                "display_name": "Christoph",
                "anonymous_session_id": uuid.uuid4().hex,
                "shot_limit": friends_event.shots_per_guest,
                "shots_committed": 12,
            },
        )

        # An anonymous guest, to prove participation needs no account.
        Participant.objects.get_or_create(
            event=own_event,
            display_name="Tante Erika",
            defaults={
                "anonymous_session_id": uuid.uuid4().hex,
                "shot_limit": own_event.shots_per_guest,
                "shots_committed": 3,
            },
        )

        # --- Report --------------------------------------------------------
        out = self.stdout
        style = self.style

        out.write(style.SUCCESS(f"\n{'Created' if host_created else 'Updated'} test account\n"))
        out.write(f"  email     {host.email}")
        out.write(f"  password  {DEV_PASSWORD}   (only needed for /admin)")
        out.write("")
        out.write(style.SUCCESS("One account, two roles"))
        out.write(f"  hosts       {own_event.title}   ({own_event.join_code})")
        out.write(
            f"  attends     {friends_event.title}   "
            f"({friends_event.join_code}, {participation.shots_committed} photos, revealed)"
        )
        out.write("")
        out.write(style.SUCCESS("Sign in"))
        out.write("  1. make host-web        →  http://127.0.0.1:8081")
        out.write(f"  2. enter {host.email}")
        out.write("  3. read the code in Mailpit  →  http://127.0.0.1:8035")
        out.write("")
        out.write(style.SUCCESS("Guest camera"))
        out.write(f"  http://127.0.0.1:5173/?code={own_event.join_code}")
        out.write("")
        out.write(style.SUCCESS("Admin"))
        out.write("  http://127.0.0.1:8000/admin")
        out.write("")
