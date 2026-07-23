"""Sign-in emails.

Deliberately plain text for now. Two things matter far more than styling:
speed of delivery, and the code being readable at a glance in a notification
preview — which is why it sits on its own line near the top.

"Speed is deliverability, not code." CONCEPT.md §4.
"""

from django.conf import settings
from django.core.mail import send_mail

from .constants import CODE_TTL


def send_login_code(email: str, code: str, *, language: str = "en") -> None:
    minutes = int(CODE_TTL.total_seconds() // 60)

    if language.startswith("de"):
        subject = f"{code} — dein Luma-Code"
        body = (
            f"Dein Anmeldecode:\n\n"
            f"    {code}\n\n"
            f"Er gilt {minutes} Minuten und kann nur einmal verwendet werden.\n\n"
            f"Wenn du das nicht warst, kannst du diese Mail ignorieren — "
            f"ohne den Code passiert nichts.\n"
        )
    else:
        subject = f"{code} — your Luma code"
        body = (
            f"Your sign-in code:\n\n"
            f"    {code}\n\n"
            f"It works for {minutes} minutes and can only be used once.\n\n"
            f"If this wasn't you, you can ignore this email — "
            f"nothing happens without the code.\n"
        )

    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )
