resource "hcloud_ssh_key" "admin" {
  name       = "${local.name}-admin"
  public_key = var.ssh_public_key
  labels     = local.labels
}

# Postgres data lives on its own volume. The server can then be destroyed and
# recreated — a routine operation — without touching the database.
resource "hcloud_volume" "data" {
  name     = "${local.name}-data"
  size     = var.data_volume_size_gb
  location = var.location
  format   = "ext4"
  labels   = local.labels

  lifecycle {
    prevent_destroy = true
  }
}

resource "hcloud_server" "app" {
  name         = "${local.name}-app"
  server_type  = var.server_type
  image        = var.server_image
  location     = var.location
  backups      = var.enable_server_backups
  ssh_keys     = [hcloud_ssh_key.admin.id]
  firewall_ids = [hcloud_firewall.app.id]
  labels       = local.labels

  public_net {
    ipv4_enabled = true
    ipv4         = hcloud_primary_ip.app_v4.id
    ipv6_enabled = true
  }

  network {
    network_id = hcloud_network.main.id
    ip         = "10.20.1.10"
  }

  user_data = templatefile("${path.module}/cloud-init.yaml", {
    volume_device = hcloud_volume.data.linux_device
  })

  depends_on = [hcloud_network_subnet.app]

  lifecycle {
    # user_data changes would otherwise force the server to be recreated.
    # Configuration changes belong in the deploy step, not in reprovisioning.
    ignore_changes = [user_data]
  }
}

resource "hcloud_volume_attachment" "data" {
  volume_id = hcloud_volume.data.id
  server_id = hcloud_server.app.id
  automount = false
}
