"""Local child-face blurring, run inside the Celery worker.

Nothing leaves our infrastructure: detection and blurring happen here, on the
bytes we already hold, with vendored model files. Two models, both small and
local:

* a face detector (OpenCV **YuNet**, ONNX) to find every face, and
* an age estimator (the Levi & Hassner Caffe age net) to guess each one's age.

Faces estimated as children are blurred. Because age estimation is unreliable —
and a missed child is the one failure this feature must not have — the policy
is deliberately fail-safe: a face is blurred if it is estimated to be a child
*or* the estimate is uncertain (see settings.FACE_*). We would rather blur an
occasional adult than ever expose a child.

cv2/numpy are imported lazily inside the functions, not at module load: the
web process and the test suite import this module for its symbols without
needing the native wheels or the model files present.
"""

from __future__ import annotations

import functools
import logging
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)

# The age net predicts a bracket, not a number. We threshold on the bracket's
# upper bound, so "(8-12)" is treated as age 12 — the conservative reading.
_AGE_BUCKET_UPPER = [2, 6, 12, 20, 32, 43, 53, 100]
# The mean pixel values the Caffe age net was trained against.
_AGE_MODEL_MEAN = (78.4263377603, 87.7689143744, 114.895847746)
# The age net was trained on face crops that include surrounding context (hair,
# jaw, some background). Fed a tight detector box it collapses everything to
# "toddler" — verified: an adult scored (0-2) p=1.0 tight, (25-32) p=1.0 with
# margin. So the age crop is padded by this fraction on each side; the blur
# still lands on the tight box, only the age estimate sees the context.
_AGE_CONTEXT_MARGIN = 0.4


class FaceModelsMissing(RuntimeError):
    """A model file is not on disk. Run scripts/fetch-face-models.sh."""


@functools.lru_cache(maxsize=1)
def _face_detector():
    import cv2

    path = Path(settings.FACE_MODELS_DIR) / "face_detection_yunet_2023mar.onnx"
    if not path.exists():
        raise FaceModelsMissing(f"Face detector model missing: {path}")
    # Input size is set per image before each detect() call.
    return cv2.FaceDetectorYN.create(str(path), "", (0, 0), settings.FACE_DETECT_CONFIDENCE)


@functools.lru_cache(maxsize=1)
def _age_net():
    import cv2

    proto = Path(settings.FACE_MODELS_DIR) / "age_deploy.prototxt"
    weights = Path(settings.FACE_MODELS_DIR) / "age_net.caffemodel"
    if not proto.exists() or not weights.exists():
        raise FaceModelsMissing(f"Age model missing: {proto} / {weights}")
    return cv2.dnn.readNetFromCaffe(str(proto), str(weights))


def _estimate_age_upper(face_bgr) -> tuple[int, bool] | None:
    """Return (estimated age upper-bound, confident?) for a cropped face, or
    None if it can't be read."""
    import cv2

    if face_bgr.size == 0:
        return None
    blob = cv2.dnn.blobFromImage(
        face_bgr, 1.0, (227, 227), _AGE_MODEL_MEAN, swapRB=False, crop=False
    )
    net = _age_net()
    net.setInput(blob)
    preds = net.forward()[0]
    index = int(preds.argmax())
    return _AGE_BUCKET_UPPER[index], float(preds[index]) >= 0.5


def _blur_region(img, x0: int, y0: int, x1: int, y1: int) -> None:
    """Blur one face box in place, hard enough that no feature survives."""
    import cv2

    region = img[y0:y1, x0:x1]
    if region.size == 0:
        return
    # Kernel scales with the face, and must be odd. A big face needs a big
    # kernel or the blur is cosmetic rather than de-identifying.
    kernel = max(15, ((x1 - x0) // 3) | 1)
    img[y0:y1, x0:x1] = cv2.GaussianBlur(region, (kernel, kernel), 0)


def detect_and_blur(image_bytes: bytes) -> tuple[bytes, dict]:
    """Detect faces, blur the children (and the uncertain), and return the
    JPEG bytes plus a small stats dict `{"detected": n, "blurred": m}`.

    Raises FaceModelsMissing if the models aren't on disk, or ValueError if the
    bytes aren't a decodable image — the caller treats either as a failure and
    keeps the photo out of the album, which is the safe outcome.
    """
    import cv2
    import numpy as np

    array = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image for blurring.")

    height, width = img.shape[:2]
    detector = _face_detector()
    detector.setInputSize((width, height))
    _, faces = detector.detect(img)

    fail_safe = settings.FACE_BLUR_ON_UNCERTAIN
    max_child_age = settings.FACE_MAX_CHILD_AGE

    faces = faces if faces is not None else []
    blurred = 0
    for face in faces:
        x, y, fw, fh = (int(v) for v in face[:4])
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(width, x + fw), min(height, y + fh)
        if x1 <= x0 or y1 <= y0:
            continue

        # Age needs context around the face; blurring does not. Expand the crop
        # for the estimate only, clamped to the image.
        mx, my = int((x1 - x0) * _AGE_CONTEXT_MARGIN), int((y1 - y0) * _AGE_CONTEXT_MARGIN)
        age_crop = img[max(0, y0 - my) : min(height, y1 + my), max(0, x0 - mx) : min(width, x1 + mx)]

        estimate = _estimate_age_upper(age_crop)
        if estimate is None:
            should_blur = fail_safe
        else:
            upper, confident = estimate
            should_blur = upper <= max_child_age or (not confident and fail_safe)

        if should_blur:
            _blur_region(img, x0, y0, x1, y1)
            blurred += 1

    ok, buffer = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        raise ValueError("Could not encode blurred image.")

    stats = {"detected": len(faces), "blurred": blurred}
    logger.info("blur: detected %(detected)d face(s), blurred %(blurred)d", stats)
    return buffer.tobytes(), stats


def blur_children_in_image(image_bytes: bytes) -> bytes:
    """The bytes-in, bytes-out form the Celery task uses."""
    blurred, _stats = detect_and_blur(image_bytes)
    return blurred
