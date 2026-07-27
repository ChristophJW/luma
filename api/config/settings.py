"""Django settings for Luma.

Single env-driven settings module. Everything that differs between local and
production comes from the environment, so there is no local/production split to
drift apart.
"""

import os
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent

load_dotenv(REPO_ROOT / ".env")


def env_bool(key: str, default: bool = False) -> bool:
    return os.getenv(key, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(key: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.getenv(key, default).split(",") if item.strip()]


# --- Core -----------------------------------------------------------------

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-not-secret")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0")

# A phone on the same wifi needs to reach the dev server by LAN IP. In DEBUG we
# accept any host so that testing on a real device does not require editing
# .env every time the router hands out a new address. See CHECKLIST.md §11 —
# real-device testing is a gate, so it must be frictionless.
if DEBUG:
    ALLOWED_HOSTS = ["*"]

# Email is the identity — no username field. Set before the first migration;
# changing it later requires a database rebuild.
AUTH_USER_MODEL = "accounts.User"

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third party
    "corsheaders",
    # local
    "apps.accounts",
    "apps.events",
    "apps.notifications",
    "apps.participants",
    "apps.media",
    "apps.faces",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# --- Database -------------------------------------------------------------

DATABASES = {
    "default": dj_database_url.parse(
        os.getenv("DATABASE_URL", "postgres://luma:luma@127.0.0.1:5442/luma"),
        conn_max_age=600,
    )
}

# --- Cache / Redis --------------------------------------------------------

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6390/0")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
    }
}

# --- Celery ---------------------------------------------------------------

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6390/1")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6390/2")
CELERY_TASK_DEFAULT_QUEUE = "default"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60

# Face inference gets its own queue so a backlog of embeddings can never delay a
# guest's thumbnail. See CONCEPT.md, Background processing.
CELERY_TASK_ROUTES = {
    "apps.faces.tasks.*": {"queue": "inference"},
}

# --- Face blurring --------------------------------------------------------
# Local, in-worker detection — children's photographs never leave our infra.
# Detection cannot truly tell a child from an adult, so this is deliberately
# fail-safe: a face is blurred if it is estimated to be a child OR the estimate
# is uncertain. A missed child (shown unblurred) is the one outcome this
# feature exists to prevent, so we err toward over-blurring.
FACE_MODELS_DIR = os.getenv("FACE_MODELS_DIR", str(BASE_DIR / "apps" / "faces" / "models"))
# Faces estimated at this age or below are blurred. The age model's buckets top
# out per bracket; 17 keeps the whole "under 18" range in scope.
FACE_MAX_CHILD_AGE = int(os.getenv("FACE_MAX_CHILD_AGE", "17"))
# Below this detector confidence a region is treated as uncertain — and blurred.
FACE_DETECT_CONFIDENCE = float(os.getenv("FACE_DETECT_CONFIDENCE", "0.6"))
# Fail-safe: blur faces whose age estimate is low-confidence rather than skip.
FACE_BLUR_ON_UNCERTAIN = env_bool("FACE_BLUR_ON_UNCERTAIN", True)

# --- Object storage -------------------------------------------------------
# Photographs never pass through Django. The browser PUTs directly to storage
# using a pre-signed URL issued after a shot has been reserved server-side.

S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", "http://127.0.0.1:9010")
S3_PUBLIC_ENDPOINT_URL = os.getenv("S3_PUBLIC_ENDPOINT_URL", S3_ENDPOINT_URL)
S3_ACCESS_KEY_ID = os.getenv("S3_ACCESS_KEY_ID", "lumaminio")
S3_SECRET_ACCESS_KEY = os.getenv("S3_SECRET_ACCESS_KEY", "lumaminio")
S3_REGION = os.getenv("S3_REGION", "eu-central-1")
S3_BUCKET_ORIGINALS = os.getenv("S3_BUCKET_ORIGINALS", "luma-originals")
S3_BUCKET_DERIVATIVES = os.getenv("S3_BUCKET_DERIVATIVES", "luma-derivatives")
S3_PRESIGN_EXPIRY_SECONDS = 15 * 60

# --- Email ----------------------------------------------------------------

# Pluggable, so local development stays on Mailpit while a deployment can use
# a real provider without a code change. Deliverability to GMX and Web.de is a
# launch blocker (CHECKLIST.md §9), so expect to A/B more than one.
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "127.0.0.1")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "1035"))
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", False)
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "hello@luma.local")

# --- Azure Communication Services Email -----------------------------------
# Only read when EMAIL_BACKEND points at the ACS backend. Provision the
# resource in an EU data location — Azure is a US-jurisdiction sub-processor
# and needs a DPA plus a privacy-policy entry (CHECKLIST.md §2).

AZURE_ACS_CONNECTION_STRING = os.getenv("AZURE_ACS_CONNECTION_STRING", "")
AZURE_ACS_ENDPOINT = os.getenv("AZURE_ACS_ENDPOINT", "")
AZURE_ACS_ACCESS_KEY = os.getenv("AZURE_ACS_ACCESS_KEY", "")
AZURE_ACS_SENDER = os.getenv("AZURE_ACS_SENDER", "")
# Blocking on delivery confirmation adds seconds to a sign-in request. Leave
# off unless you need the operation id.
AZURE_ACS_WAIT_FOR_SEND = env_bool("AZURE_ACS_WAIT_FOR_SEND", False)

# --- CORS -----------------------------------------------------------------

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://127.0.0.1:5173")
CORS_ALLOW_CREDENTIALS = True

# In DEBUG, allow any LAN origin so the guest camera can be opened from a phone.
if DEBUG:
    CORS_ALLOWED_ORIGIN_REGEXES = [
        r"^http://(localhost|127\.0\.0\.1|192\.168\.[\d.]+|10\.[\d.]+):\d+$"
    ]

# --- i18n -----------------------------------------------------------------
# German and English from day one. See DESIGN.md, Non-negotiable #7.

LANGUAGE_CODE = "en"
LANGUAGES = [("en", "English"), ("de", "Deutsch")]
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Static ---------------------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# --- Guest camera ---------------------------------------------------------
# The base a join code is appended to, and what a QR code encodes. In
# production this is the short join domain (CHECKLIST.md §4).
GUEST_BASE_URL = os.getenv("GUEST_BASE_URL", "http://127.0.0.1:5173")

# --- Host app -------------------------------------------------------------
# Where the magic sign-in link points. The host app reads a `?magic=` token
# from this URL and verifies it. In production this is the host web origin (or
# a universal-link domain associated with the native app).
HOST_BASE_URL = os.getenv("HOST_BASE_URL", "http://127.0.0.1:8081")

# --- Feature flags --------------------------------------------------------

FEATURE_FACE_LOOKUP = env_bool("FEATURE_FACE_LOOKUP", False)

# --- Guest session --------------------------------------------------------

GUEST_SESSION_COOKIE_NAME = "luma_guest"
GUEST_SESSION_MAX_AGE = 60 * 60 * 24 * 90

# --- Logging --------------------------------------------------------------
# Never log photograph bytes, join tokens, or raw IPs.

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"simple": {"format": "{levelname} {name} {message}", "style": "{"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "simple"}},
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.db.backends": {"level": "WARNING"},
        # The Azure SDK logs entire HTTP request/response exchanges at INFO.
        # Noisy, and it puts recipient metadata into the logs.
        "azure": {"level": "WARNING"},
        "azure.core.pipeline.policies.http_logging_policy": {"level": "WARNING"},
    },
}
