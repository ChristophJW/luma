output "server_ipv4" {
  description = "Public IPv4. Point your A record here."
  value       = hcloud_primary_ip.app_v4.ip_address
}

output "server_ipv6" {
  description = "Public IPv6."
  value       = hcloud_server.app.ipv6_address
}

output "server_private_ip" {
  description = "Private network address, for a second node later."
  value       = tolist(hcloud_server.app.network)[0].ip
}

output "ssh_command" {
  description = "Connect to the server."
  value       = "ssh luma@${hcloud_primary_ip.app_v4.ip_address}"
}

output "location" {
  description = "Datacentre location — must be a German site."
  value       = var.location
}

output "buckets" {
  description = "Object storage bucket names."
  value = {
    originals   = aws_s3_bucket.originals.bucket
    derivatives = aws_s3_bucket.derivatives.bucket
    exports     = aws_s3_bucket.exports.bucket
  }
}

output "s3_endpoint" {
  description = "Object storage endpoint for the application's S3_ENDPOINT_URL."
  value       = var.s3_endpoint
}
