terraform {
  required_version = ">= 1.9"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.49"
    }
    # Hetzner Object Storage speaks the S3 API, so the AWS provider manages
    # buckets against a custom endpoint. There is no native hcloud resource
    # for object storage.
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }

  # Local state is fine for a single operator pre-launch. Move to a remote
  # backend before a second person can run `apply` — two people with divergent
  # local state is how infrastructure gets destroyed by accident.
  #
  # Hetzner Object Storage can host it:
  #
  # backend "s3" {
  #   bucket                      = "luma-tfstate"
  #   key                         = "prod/terraform.tfstate"
  #   region                      = "eu-central-1"
  #   endpoints                   = { s3 = "https://nbg1.your-objectstorage.com" }
  #   skip_credentials_validation = true
  #   skip_region_validation      = true
  #   skip_requesting_account_id  = true
  #   skip_s3_checksum            = true
  #   use_path_style              = true
  # }
}
