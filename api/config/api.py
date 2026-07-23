"""Root API router.

Every route lives under /api. The OpenAPI schema at /api/openapi.json is the
source of truth for the generated clients used by the guest camera, the host
app and the marketing site.
"""

from django.conf import settings
from django.db import connection
from ninja import NinjaAPI, Schema

from apps.accounts.api import router as auth_router
from apps.events.api import router as events_router
from apps.participants.api import router as guest_router

api = NinjaAPI(
    title="Luma API",
    version="0.1.0",
    description="Private camera experience for weddings and events.",
    docs_url="/docs",
)


class HealthOut(Schema):
    status: str
    database: bool
    debug: bool
    face_lookup_enabled: bool


@api.get("/health", response=HealthOut, tags=["meta"])
def health(request) -> HealthOut:
    """Liveness probe. Also used by the guest camera to confirm connectivity."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        database_ok = True
    except Exception:  # noqa: BLE001 — health checks must never raise
        database_ok = False

    return HealthOut(
        status="ok" if database_ok else "degraded",
        database=database_ok,
        debug=settings.DEBUG,
        face_lookup_enabled=settings.FEATURE_FACE_LOOKUP,
    )


api.add_router("/auth", auth_router)
api.add_router("/events", events_router)
api.add_router("/guest", guest_router)
