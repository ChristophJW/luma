"""Background child-face blurring.

One task per uploaded photograph, on the `inference` queue (routed in
settings). It reads the original, blurs any child faces, writes the derivative
to the derivatives bucket, and only then marks the asset READY — which is what
makes it appear in the album. Until then the album shows nothing for it, so an
unblurred original is never served in a blur-on event.

A failure leaves the asset FAILED (and therefore out of the album): if we
cannot prove a photo was blurred, we do not show it.
"""

from __future__ import annotations

import logging

from celery import shared_task
from django.conf import settings

from apps.media import storage
from apps.media.models import MediaAsset, ProcessingStatus

from . import detector

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def blur_faces(self, media_id: str) -> None:
    media = MediaAsset.objects.filter(id=media_id).select_related("event").first()
    if media is None:
        logger.warning("blur_faces: media %s no longer exists", media_id)
        return

    # The host may have turned blurring off between upload and now. With no
    # blur required, the original is fine to publish as-is.
    if not media.event.blur_child_faces:
        media.processing_status = ProcessingStatus.READY
        media.save(update_fields=["processing_status"])
        return

    try:
        original = storage.get_bytes(media.storage_key)
        blurred = detector.blur_children_in_image(original)
        key = storage.blurred_key(media.event_id, media.id)
        storage.put_bytes(key, blurred, "image/jpeg", bucket=settings.S3_BUCKET_DERIVATIVES)
    except ValueError:
        # The bytes are not a decodable image. Retrying cannot fix that, and we
        # must not publish an un-blurred original — so this photo stops here,
        # FAILED and out of the album.
        logger.exception("blur_faces: undecodable image for %s", media_id)
        media.processing_status = ProcessingStatus.FAILED
        media.save(update_fields=["processing_status"])
        return
    except Exception as exc:
        # Models not yet installed, or a storage blip — transient. Leave the
        # asset in PROCESSING (hidden, safe) and retry.
        logger.exception("blur_faces: transient failure for %s", media_id)
        raise self.retry(exc=exc)

    media.blurred_storage_key = key
    media.processing_status = ProcessingStatus.READY
    media.save(update_fields=["blurred_storage_key", "processing_status"])
