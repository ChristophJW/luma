"""Auth tuning values.

In their own module so that models.py and services.py can both use them
without importing each other.
"""

from datetime import timedelta

CODE_LENGTH = 6
CODE_TTL = timedelta(minutes=10)
MAX_CODE_ATTEMPTS = 5

# Rate limits and short expiry replace CAPTCHA, so the happy path stays clean.
# CONCEPT.md §4.
RESEND_COOLDOWN = timedelta(seconds=60)
MAX_CODES_PER_EMAIL_PER_HOUR = 5
MAX_CODES_PER_IP_PER_HOUR = 20

SESSION_TTL = timedelta(days=30)
