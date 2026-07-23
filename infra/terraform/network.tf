locals {
  name = "luma-${var.environment}"

  labels = {
    project     = "luma"
    environment = var.environment
    managed_by  = "terraform"
  }

  # Datacentre suffixes are not uniform across locations — Nuremberg is dc3 but
  # Falkenstein is dc14, so this cannot be derived by string interpolation.
  # Verify against `hcloud datacenter list` if Hetzner adds capacity.
  datacenters = {
    nbg1 = "nbg1-dc3"
    fsn1 = "fsn1-dc14"
  }
}

# A private network exists from day one so that adding a second app node or a
# load balancer later is an addition, not a migration.
resource "hcloud_network" "main" {
  name     = local.name
  ip_range = "10.20.0.0/16"
  labels   = local.labels
}

resource "hcloud_network_subnet" "app" {
  network_id   = hcloud_network.main.id
  type         = "cloud"
  network_zone = "eu-central"
  ip_range     = "10.20.1.0/24"
}

# Stable public IP, kept independent of the server so the machine can be
# rebuilt without changing DNS.
resource "hcloud_primary_ip" "app_v4" {
  name        = "${local.name}-v4"
  type        = "ipv4"
  datacenter  = local.datacenters[var.location]
  auto_delete = false
  labels      = local.labels
}

resource "hcloud_firewall" "app" {
  name   = "${local.name}-app"
  labels = local.labels

  rule {
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = var.admin_ipv4_cidrs
    description = "SSH"
  }

  rule {
    direction   = "in"
    protocol    = "tcp"
    port        = "80"
    source_ips  = ["0.0.0.0/0", "::/0"]
    description = "HTTP — redirects to HTTPS, and serves ACME challenges"
  }

  rule {
    direction   = "in"
    protocol    = "tcp"
    port        = "443"
    source_ips  = ["0.0.0.0/0", "::/0"]
    description = "HTTPS"
  }

  rule {
    direction   = "in"
    protocol    = "icmp"
    source_ips  = ["0.0.0.0/0", "::/0"]
    description = "ICMP — ping, MTU discovery"
  }

  # Postgres and Redis are deliberately absent. They bind to localhost or the
  # private network only, and are never reachable from the internet.
}
