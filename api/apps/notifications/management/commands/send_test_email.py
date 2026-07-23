"""Send one real email and report exactly what happened.

    make mail-test EMAIL=you@yourdomain.de

Reports the resolved backend and sender before sending, so a misconfiguration
is visible rather than inferred from an email that never arrives.

Deliverability to the big German consumer providers is a launch blocker
(CHECKLIST.md §9), so this is meant to be run against a real GMX, Web.de,
Gmail and Outlook address — not just once against your own domain.
"""

import time

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Send a test email through the configured backend."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--to", "-t", required=True, help="Recipient address.")
        parser.add_argument(
            "--subject",
            default="Luma test email",
            help="Override the subject.",
        )

    def handle(self, *args, **options) -> None:
        recipient = options["to"]
        style = self.style
        out = self.stdout

        backend_path = settings.EMAIL_BACKEND
        is_acs = "azure_acs" in backend_path
        is_smtp = backend_path.endswith("smtp.EmailBackend")

        out.write("")
        out.write(style.SUCCESS("Configuration"))
        out.write(f"  backend    {backend_path}")

        if is_acs:
            using_string = bool(settings.AZURE_ACS_CONNECTION_STRING)
            out.write(f"  auth       {'connection string' if using_string else 'endpoint + key'}")
            if not using_string:
                out.write(f"  endpoint   {settings.AZURE_ACS_ENDPOINT or '(unset)'}")
            out.write(f"  sender     {settings.AZURE_ACS_SENDER or '(unset)'}")

            if not (
                using_string or (settings.AZURE_ACS_ENDPOINT and settings.AZURE_ACS_ACCESS_KEY)
            ):
                raise CommandError(
                    "ACS credentials are missing. Set AZURE_ACS_CONNECTION_STRING, or "
                    "AZURE_ACS_ENDPOINT and AZURE_ACS_ACCESS_KEY, in .env."
                )
            if not settings.AZURE_ACS_SENDER:
                raise CommandError(
                    "AZURE_ACS_SENDER is unset. It must be a verified sender on a "
                    "domain provisioned in the ACS resource."
                )
        elif is_smtp:
            out.write(f"  smtp       {settings.EMAIL_HOST}:{settings.EMAIL_PORT}")
            out.write(f"  sender     {settings.DEFAULT_FROM_EMAIL}")
            if settings.EMAIL_PORT in (1025, 1035):
                out.write(
                    style.WARNING(
                        "  note       this is Mailpit — nothing will leave this machine.\n"
                        "             Uncomment EMAIL_BACKEND in .env to use ACS."
                    )
                )

        out.write(f"  to         {recipient}")
        out.write("")

        message = EmailMultiAlternatives(
            subject=options["subject"],
            body=(
                "This is a Luma test email.\n\n"
                "If you are reading this, the configured provider delivered it.\n\n"
                "Check: did it land in the inbox or in spam? How long did it take?\n"
            ),
            to=[recipient],
            connection=get_connection(),
        )
        message.attach_alternative(
            "<p>This is a <strong>Luma</strong> test email.</p>"
            "<p>If you are reading this, the configured provider delivered it.</p>"
            "<p>Check: did it land in the inbox or in spam? How long did it take?</p>",
            "text/html",
        )

        started = time.monotonic()
        try:
            sent = message.send(fail_silently=False)
        except Exception as exc:
            raise CommandError(f"Send failed: {exc}") from exc
        elapsed = time.monotonic() - started

        if not sent:
            raise CommandError("The backend reported 0 messages sent.")

        out.write(style.SUCCESS(f"Accepted in {elapsed:.2f}s"))
        out.write("")

        if is_smtp and settings.EMAIL_PORT in (1025, 1035):
            out.write("  Read it at  http://127.0.0.1:8035")
        else:
            out.write("  Acceptance is not delivery. Confirm it arrived, and note:")
            out.write("    · inbox or spam")
            out.write("    · time to inbox (above ~10s feels broken during sign-up)")
            out.write("    · repeat for GMX, Web.de, Gmail and Outlook — CHECKLIST.md §9")
        out.write("")
