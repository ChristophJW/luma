variable "hcloud_token" {
  description = "Hetzner Cloud API token (Project → Security → API tokens, read/write)."
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Environment name. Used as a resource name prefix."
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["prod", "staging"], var.environment)
    error_message = "environment must be prod or staging."
  }
}

variable "location" {
  description = "Hetzner location. German locations only."
  type        = string
  default     = "nbg1"

  # This is the Terraform equivalent of a cloud org-policy location constraint:
  # it makes German data residency a property of the code rather than a promise.
  # Hetzner also operates hel1 (Finland — EU, but not Germany) and ash/hil/sin
  # (United States, Singapore). Those must never be selectable here.
  validation {
    condition     = contains(["nbg1", "fsn1"], var.location)
    error_message = "location must be nbg1 (Nuremberg) or fsn1 (Falkenstein). German data residency is a product claim — see CONCEPT.md."
  }
}

variable "server_type" {
  description = "Hetzner server type. cx32 = 4 vCPU / 8 GB / 80 GB."
  type        = string
  default     = "cx32"
}

variable "server_image" {
  description = "Base image."
  type        = string
  default     = "debian-12"
}

variable "ssh_public_key" {
  description = "SSH public key granted root access to the server."
  type        = string
}

variable "admin_ipv4_cidrs" {
  description = <<-EOT
    Source ranges allowed to reach SSH. Defaults to the whole internet, which
    is wrong for production — set this to your own address. Photographs of
    other people's weddings live behind this port.
  EOT
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

variable "data_volume_size_gb" {
  description = "Volume for Postgres data, kept separate so the server can be rebuilt without data loss."
  type        = number
  default     = 50
}

variable "enable_server_backups" {
  description = "Hetzner automated server backups (+20% of server cost). Not a substitute for tested pg_dump backups."
  type        = bool
  default     = true
}

# --- Object storage --------------------------------------------------------
# S3 credentials are generated in the Hetzner console (Object Storage →
# Credentials) and cannot be created by Terraform. Supply them here.

variable "s3_endpoint" {
  description = "Hetzner Object Storage endpoint, e.g. https://nbg1.your-objectstorage.com"
  type        = string
  default     = "https://nbg1.your-objectstorage.com"
}

variable "s3_access_key" {
  description = "Hetzner Object Storage access key."
  type        = string
  sensitive   = true
}

variable "s3_secret_key" {
  description = "Hetzner Object Storage secret key."
  type        = string
  sensitive   = true
}

variable "bucket_prefix" {
  description = "Bucket name prefix. Bucket names are globally unique per endpoint."
  type        = string
  default     = "luma"
}

variable "guest_origins" {
  description = "Origins allowed to PUT directly to object storage. The guest camera uploads straight to storage via a pre-signed URL, so its origin must be listed here or every upload fails CORS."
  type        = list(string)
  default     = ["https://luma.de", "https://app.luma.de"]
}

variable "export_retention_days" {
  description = "Days before a generated album ZIP is deleted. Export links are meant to expire."
  type        = number
  default     = 7
}
