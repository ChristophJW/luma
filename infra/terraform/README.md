# Luma — Infrastructure

Hetzner Cloud, German locations only. See `CHECKLIST.md` §3.

## What Terraform manages

| Resource | Notes |
| --- | --- |
| `hcloud_server` | Application node — Django, Celery, Postgres, Redis, Caddy |
| `hcloud_volume` | Postgres data, separate from the server so it can be rebuilt |
| `hcloud_primary_ip` | Stable IPv4, survives server replacement — DNS never changes |
| `hcloud_network` + subnet | Private network, present from day one so a second node is an addition rather than a migration |
| `hcloud_firewall` | 22 (restricted), 80, 443, ICMP. Postgres and Redis are deliberately absent |
| `aws_s3_bucket` ×3 | `originals`, `derivatives`, `exports` on Hetzner Object Storage |
| CORS + lifecycle | Direct browser upload, and expiry for ZIPs and abandoned multipart uploads |

## What it does not manage, and why

- **Object storage credentials** — created in the Hetzner console (Object Storage → Credentials); there is no API for them. Supply via `terraform.tfvars`.
- **DNS** — the domain isn't registered yet (`CHECKLIST.md` §1). Point an A record at the `server_ipv4` output once it is.
- **CDN** — deferred. At pilot scale, serving derivatives straight from object storage is fine, and Hetzner egress is cheap. Add bunny.net when the reveal spike (`CHECKLIST.md` §12) actually justifies it, not before.
- **Application deployment** — Terraform provisions the machine; it does not deploy code. `cloud-init.yaml` runs once at first boot and stops at "Docker is installed and the volume is mounted".

## First run

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # then fill it in
terraform init
terraform plan
terraform apply
```

Before applying, in the Hetzner console:

1. Create a project and a read/write API token → `hcloud_token`
2. Create Object Storage credentials → `s3_access_key` / `s3_secret_key`
3. Confirm the Object Storage endpoint region matches `var.location`

## Data residency

`var.location` is restricted by a validation rule to `nbg1` (Nuremberg) or `fsn1` (Falkenstein). Hetzner also operates `hel1` (Finland — EU, but not Germany) and `ash` / `hil` / `sin` (US, Singapore). Those are rejected at plan time:

```
Error: Invalid value for variable
  var.location is "hel1"
```

This is the code equivalent of a cloud org-policy location constraint. German residency is a product claim (`CONCEPT.md`, differentiator #1) and a privacy-policy statement (`CHECKLIST.md` §2), so it is enforced rather than documented.

## After apply

```bash
terraform output ssh_command
terraform output buckets
```

Feed the outputs into the production environment:

```
S3_ENDPOINT_URL=<s3_endpoint output>
S3_BUCKET_ORIGINALS=<buckets.originals>
S3_BUCKET_DERIVATIVES=<buckets.derivatives>
```

Nothing in the application changes between local and production — MinIO and Hetzner Object Storage both speak S3, which is why the storage layer was never coupled to a vendor SDK.

## Before this is production-ready

- [ ] Set `admin_ipv4_cidrs` to your own address — it defaults to the whole internet
- [ ] Move state to a remote backend before a second person can run `apply` (commented block in `versions.tf`)
- [ ] Automated `pg_dump` to the `exports` bucket, **and a restore you have actually performed** (`CHECKLIST.md` §3)
- [ ] Uptime monitoring with alerting to a phone
- [ ] Deploy tooling: production compose file, Caddy config, release process

## Scaling, when it matters

Not now. But the shape is already in place: the private network exists, the IP is detached from the server, and Postgres is on its own volume. Growing means adding `hcloud_load_balancer`, raising a `count`, and moving Postgres to its own node — additive changes, not a rebuild.

The real limit is that this is **one machine with no failover**, and a wedding cannot be re-run. That is acceptable through the pilot, when you will be present anyway. It stops being acceptable the first Saturday two weddings run at once — see `CHECKLIST.md` §14.
