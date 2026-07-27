"""Sign-in emails.

Two things still matter far more than styling: speed of delivery, and the code
being readable at a glance in a notification preview. So the code stays in the
subject, on its own line near the top of the plain-text part, and in the HTML
preheader — most people read it in the inbox list and never open the message.
Nothing in the HTML has to load before the code is legible: no images, no web
fonts, no tracking pixel.

    "Speed is deliverability, not code." CONCEPT.md §4.

Every message goes out multipart. The plain-text part is the one this module
always sent; the HTML alternative dresses it in the landing-page design
(DESIGN.md §4-6) with the code set like the frame counter — amber, tabular,
alone on a dark ground.

Copy lives here, not in the template, because it is written per language rather
than translated (DESIGN.md §10). The template holds only design.
"""

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from .constants import CODE_TTL

TEMPLATE = "accounts/login_code.html"


def _copy(code: str, minutes: int, language: str) -> dict[str, str]:
    if language.startswith("de"):
        return {
            "language": "de",
            "subject": f"{code} — dein Luma-Code",
            "preheader": f"Dein Anmeldecode ist {code}. Er gilt {minutes} Minuten.",
            "eyebrow": "Anmelden",
            "headline": "Ein Code, und du bist drin.",
            "code_label": "Dein Anmeldecode",
            "validity": f"Er gilt {minutes} Minuten und kann nur einmal verwendet werden.",
            "disclaimer": (
                "Wenn du das nicht warst, kannst du diese Mail ignorieren — "
                "ohne den Code passiert nichts."
            ),
            "tagline": "Ein Tag wird zeitlos, wenn man sich gemeinsam erinnert.",
            "link_cta": "Auf diesem Gerät anmelden",
            "link_hint": "Öffne die Mail auf dem Gerät, auf dem du Luma nutzen willst.",
        }

    return {
        "language": "en",
        "subject": f"{code} — your Luma code",
        "preheader": f"Your sign-in code is {code}. It works for {minutes} minutes.",
        "eyebrow": "Sign in",
        "headline": "One code, and you're in.",
        "code_label": "Your sign-in code",
        "validity": f"It works for {minutes} minutes and can only be used once.",
        "disclaimer": (
            "If this wasn't you, you can ignore this email — nothing happens without the code."
        ),
        "tagline": "A single day becomes timeless when it's remembered together.",
        "link_cta": "Sign in on this device",
        "link_hint": "Open this email on the device you want to use Luma on.",
    }


def render_login_code(code: str, *, link: str = "", language: str = "en") -> tuple[str, str, str]:
    """Return (subject, plain text, html) for a sign-in code.

    Split out from sending so both parts can be rendered in a test or a preview
    without a mail backend — and so the two parts are built from one set of
    strings and cannot drift apart.
    """
    minutes = int(CODE_TTL.total_seconds() // 60)
    copy = _copy(code, minutes, language)

    plain = f"{copy['code_label']}:\n\n    {code}\n\n{copy['validity']}\n\n{copy['disclaimer']}\n"
    if link:
        plain = (
            f"{copy['code_label']}:\n\n    {code}\n\n"
            f"{copy['link_cta']}:\n\n    {link}\n\n"
            f"{copy['validity']}\n\n{copy['disclaimer']}\n"
        )

    return copy["subject"], plain, render_to_string(TEMPLATE, {**copy, "code": code, "link": link})


def send_login_code(email: str, code: str, *, link: str = "", language: str = "en") -> None:
    subject, plain, html = render_login_code(code, link=link, language=language)

    message = EmailMultiAlternatives(
        subject=subject,
        body=plain,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[email],
    )
    message.attach_alternative(html, "text/html")
    message.send(fail_silently=False)
