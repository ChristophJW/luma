"""Object storage access.

Photographs never pass through Django. The browser PUTs directly to storage
using a URL signed here, which is what keeps a 200-guest reveal from melting
the application server.

Identical against MinIO locally and Hetzner Object Storage in production —
both speak S3, which is why nothing here imports a vendor SDK beyond boto3.
"""

from __future__ import annotations

import functools
from urllib.parse import urlparse

import boto3
from botocore.client import Config
from django.conf import settings
from django.core.cache import cache

# Long enough for a bad venue connection to finish a large photograph, short
# enough that a leaked URL is not a standing invitation.
UPLOAD_URL_TTL = 15 * 60
DOWNLOAD_URL_TTL = 60 * 60

# Download URLs are cached for less than they are valid for, so a URL handed
# out at the last moment still has plenty of life left.
DOWNLOAD_URL_CACHE_TTL = 50 * 60

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/heic", "image/webp"}

# A phone photograph is a few megabytes; 25 MB leaves room for a large HEIC
# while refusing anything that is obviously not a photo.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def _build(endpoint: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        region_name=settings.S3_REGION,
        # Path style so a bucket name never has to become a DNS label.
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


@functools.lru_cache(maxsize=1)
def client():
    """For work the server does itself, over whatever route it has."""
    return _build(settings.S3_ENDPOINT_URL)


@functools.lru_cache(maxsize=1)
def public_client():
    """For URLs handed to a phone or a browser.

    These must be signed against the address the *device* can reach. The
    server may talk to storage over a private hostname or 127.0.0.1, neither
    of which means anything on a guest's phone.

    It has to be a separate client rather than a string replacement on the
    result: SigV4 signs the Host header, so swapping the host afterwards
    invalidates the signature and every upload returns 403.
    """
    return _build(settings.S3_PUBLIC_ENDPOINT_URL)


@functools.lru_cache(maxsize=8)
def _client_for(endpoint: str):
    """A public client for a specific endpoint — see endpoint_for_host."""
    return _build(endpoint)


def endpoint_for_host(host: str) -> str:
    """The storage endpoint on the same hostname the client reached the API on.

    A dev convenience: the LAN address changes with the network, and a URL
    signed against a stale one is unreachable from the phone — the single most
    common reason an upload silently fails. Deriving the host from the request
    keeps capture working with nothing to reconfigure and no restart. Scheme
    and port stay as configured; only the host is swapped. Not used in
    production, where S3_PUBLIC_ENDPOINT_URL is a real, stable endpoint.
    """
    base = urlparse(settings.S3_PUBLIC_ENDPOINT_URL)
    port = f":{base.port}" if base.port else ""
    return f"{base.scheme}://{host.split(':')[0]}{port}"


def original_key(event_id, media_id, extension: str = "jpg") -> str:
    """Key layout. Grouping by event keeps deletion and export a prefix scan."""
    return f"events/{event_id}/originals/{media_id}.{extension}"


def presign_put(key: str, content_type: str, *, public_endpoint: str | None = None) -> str:
    """A URL the browser can PUT one object to.

    The content type is baked into the signature, so a client cannot promise a
    JPEG and upload something else. `public_endpoint` overrides the configured
    host for this one URL (see endpoint_for_host).
    """
    cl = _client_for(public_endpoint) if public_endpoint else public_client()
    return cl.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.S3_BUCKET_ORIGINALS,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=UPLOAD_URL_TTL,
    )


def presign_get(key: str, bucket: str | None = None, *, public_endpoint: str | None = None) -> str:
    """A URL for reading one object, stable for the length of the cache TTL.

    Stability is the whole point. SigV4 embeds the signing timestamp, so
    generating on every request yields a different URL for the same
    photograph every time — which silently defeats every URL-keyed cache in
    the chain: the browser's, the phone's image cache, and any CDN in front.
    A gallery would re-download every photograph on every open.

    Caching the signed URL instead of the bytes means one small Redis read
    turns the whole chain back on, and costs nothing at the edge.
    """
    target = bucket or settings.S3_BUCKET_ORIGINALS
    # The endpoint is part of the cache key: a URL signed for one host must not
    # be handed to a client that reached us on another.
    cache_key = f"presign:get:{public_endpoint or 'default'}:{target}:{key}"

    cached = cache.get(cache_key)
    if cached:
        return cached

    cl = _client_for(public_endpoint) if public_endpoint else public_client()
    url = cl.generate_presigned_url(
        "get_object",
        Params={"Bucket": target, "Key": key},
        ExpiresIn=DOWNLOAD_URL_TTL,
    )
    cache.set(cache_key, url, timeout=DOWNLOAD_URL_CACHE_TTL)
    return url


def head(key: str, bucket: str | None = None) -> dict | None:
    """Fetch object metadata, or None if it is not there.

    Used to verify that a confirmed upload actually arrived — a client saying
    "done" is not evidence.
    """
    try:
        return client().head_object(Bucket=bucket or settings.S3_BUCKET_ORIGINALS, Key=key)
    except Exception:
        return None
