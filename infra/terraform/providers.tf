provider "hcloud" {
  token = var.hcloud_token
}

# Hetzner Object Storage via the S3 API. Every AWS-specific behaviour has to be
# switched off — there is no AWS account, no STS, and no metadata service.
provider "aws" {
  region     = "eu-central-1" # ignored by Hetzner, but the provider demands one
  access_key = var.s3_access_key
  secret_key = var.s3_secret_key

  skip_credentials_validation = true
  skip_region_validation      = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true

  endpoints {
    s3 = var.s3_endpoint
  }
}
