#!/usr/bin/env bash
# Fetch the local models the child-face-blur worker needs (apps/faces).
#
# These weights are not committed — they are a few MB of binary that does not
# belong in git. Run this once on any machine that runs the inference worker;
# the files land in api/apps/faces/models/, which the task loads from
# settings.FACE_MODELS_DIR. Children's photos never leave the box, so detection
# runs against these local files rather than a cloud API.
#
#   ./scripts/fetch-face-models.sh
#
# If a URL has moved, override the base or drop the files in by hand — the task
# only cares that these three names exist in the models dir.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${FACE_MODELS_DIR:-$ROOT/api/apps/faces/models}"
mkdir -p "$DEST"

# Face detector: OpenCV YuNet (ONNX, ~350 KB), from the official opencv_zoo.
YUNET_URL="https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"

# Age estimator: Levi & Hassner Caffe age net. Both files come from the same
# mirror so the prototxt (architecture) and caffemodel (weights) are a matched
# pair — a mismatched pair loads but predicts nonsense.
AGE_PROTO_URL="https://raw.githubusercontent.com/smahesh29/Gender-and-Age-Detection/master/age_deploy.prototxt"
AGE_MODEL_URL="https://raw.githubusercontent.com/smahesh29/Gender-and-Age-Detection/master/age_net.caffemodel"

fetch() {
  local url="$1" out="$2"
  if [ -f "$DEST/$out" ]; then
    echo "  have    $out"
    return
  fi
  echo "  fetch   $out"
  curl -fsSL "$url" -o "$DEST/$out"
}

echo "Fetching face models into $DEST"
fetch "$YUNET_URL"     "face_detection_yunet_2023mar.onnx"
fetch "$AGE_PROTO_URL" "age_deploy.prototxt"
fetch "$AGE_MODEL_URL" "age_net.caffemodel"
echo "Done."
