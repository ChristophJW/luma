/**
 * Object storage. Photographs never pass through the application server —
 * the guest browser PUTs directly here using a pre-signed URL, and the album
 * is served from here too. See CONCEPT.md, Storage.
 *
 * Hetzner Object Storage implements a subset of the S3 API. Bucket creation,
 * CORS and lifecycle work; some AWS-only sub-resources (public access blocks,
 * bucket policies, object lock) may not. Verify before adding more.
 */

locals {
  buckets = {
    originals   = "${var.bucket_prefix}-originals"
    derivatives = "${var.bucket_prefix}-derivatives"
    exports     = "${var.bucket_prefix}-exports"
  }
}

resource "aws_s3_bucket" "originals" {
  bucket = local.buckets.originals

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket" "derivatives" {
  bucket = local.buckets.derivatives

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket" "exports" {
  bucket = local.buckets.exports
}

# The guest camera uploads straight to this bucket from the browser. Without
# CORS every upload fails, and it fails in a way that looks like a network
# problem rather than a configuration one.
resource "aws_s3_bucket_cors_configuration" "originals" {
  bucket = aws_s3_bucket.originals.id

  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = var.guest_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# Generated album ZIPs are large and disposable. Expiring them is both a cost
# control and a retention control — an export link that outlives its event is
# a privacy problem.
resource "aws_s3_bucket_lifecycle_configuration" "exports" {
  bucket = aws_s3_bucket.exports.id

  rule {
    id     = "expire-exports"
    status = "Enabled"

    filter {}

    expiration {
      days = var.export_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# Abandoned multipart uploads are invisible and billable. A guest whose phone
# died mid-upload leaves one behind.
resource "aws_s3_bucket_lifecycle_configuration" "originals" {
  bucket = aws_s3_bucket.originals.id

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 3
    }
  }
}
