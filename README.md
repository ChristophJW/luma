# Luma

A premium private camera experience for weddings and events. Guests join by scanning a QR code, capture a limited number of photographs, and discover the complete album together after the event.

- [`CONCEPT.md`](CONCEPT.md) — product concept, architecture, data model
- [`DESIGN.md`](DESIGN.md) — design system and instructions for designers
- [`CHECKLIST.md`](CHECKLIST.md) — end-to-end launch checklist

---

## Requirements

Python 3.12, Node 20+, [uv](https://docs.astral.sh/uv/), Docker with Compose v2.

Python is pinned to 3.12 (`api/.python-version`) rather than left open-ended. The inference worker will need `onnxruntime` for face lookup, and that wheel tends to lag new Python releases — uv will otherwise pick the newest interpreter on the machine.

## Setup

```bash
make setup
```

Creates `.env`, starts infrastructure, installs dependencies, runs migrations. Then in two terminals:

```bash
make dev      # api + guest + host in one terminal, Ctrl-C stops all
```

Or individually, in separate terminals:

```bash
make api        # Django          http://127.0.0.1:8000
make guest      # guest camera    http://127.0.0.1:5173
make host       # Expo            http://127.0.0.1:8081  (press w for web)
make host-web   # Expo, straight to the browser
make worker     # Celery
```

`./scripts/dev.sh` takes a subset too: `./scripts/dev.sh api guest`.

Seed the test account and sample events:

```bash
make seed
```

Creates one account with two roles, which is the point — hosting and attending
are the same account (`CONCEPT.md`, "One account, roles per event"):

| | Event | Code | |
| --- | --- | --- | --- |
| hosts | Anna & Ben | `LUMA01` | capture open |
| attends | Mira & Jonas | `LUMA02` | revealed, 12 photos |

```
email     host@example.com
password  luma-dev        ← only for /admin; sign-in is passwordless
```

To sign in, enter the email and read the 6-digit code in **Mailpit**
(http://127.0.0.1:8035). `seed` refuses to run with `DEBUG=False`.

## Local URLs

| Service | URL | Notes |
| --- | --- | --- |
| API | http://127.0.0.1:8000 | |
| API docs | http://127.0.0.1:8000/api/docs | interactive OpenAPI |
| Admin | http://127.0.0.1:8000/admin | `make superuser` first |
| Guest camera | http://127.0.0.1:5173 | |
| Marketing | http://127.0.0.1:5174 | `make marketing` |
| MinIO console | http://127.0.0.1:9011 | `lumaminio` / `lumaminio` |
| Mailpit | http://127.0.0.1:8035 | catches every outbound email |

Ports are deliberately non-standard (postgres `5442`, redis `6390`, minio `9010`) because this machine already runs another stack on the usual ones.

## Layout

```
api/                 Django + Django Ninja
  config/            settings, celery, root API router
  apps/
    events/          Event, join codes, guest-facing event lookup
    participants/    per-event guest records, shot accounting
    media/           MediaAsset, upload reservations
guest/               Preact + Vite — the guest camera, web only
host/                Expo (SDK 57) — iOS, Android and web from one codebase
packages/tokens/     design tokens shared across all frontends
scripts/             dev runner, bundle-size gate
infra/terraform/     Hetzner Cloud, German locations only
marketing/           landing page (static export) — `make marketing`
```

## Commands

```bash
make help          # list everything
make up / down     # infrastructure
make reset         # destroy all local data and start clean
make migrate
make test
make lint / format
make urls
```

---

## ⚠️ Camera testing on a real phone needs HTTPS

`getUserMedia()` only works on a **secure context**. `localhost` counts; a LAN address like `http://192.168.x.x:5173` does **not**. Opening the guest camera on your phone over plain HTTP will silently fail to get camera access — and real-device testing is the project's first gate (`CHECKLIST.md` §0 and §11).

Two workable options:

**A tunnel — easiest, works on iOS immediately**

```bash
cloudflared tunnel --url http://localhost:5173
```

Gives a real, publicly-trusted HTTPS URL. This is the pragmatic choice for iOS Safari, and the only one that also lets you test the WhatsApp and Instagram in-app browsers by sending yourself the link.

**mkcert — local, no external dependency**

```bash
mkcert -install && mkcert 192.168.188.21 localhost
```

Then point Vite's `server.https` at the generated files. On iOS you must additionally install the mkcert root CA on the device *and* enable full trust for it under Settings → General → About → Certificate Trust Settings. Fiddly, but offline.

## Bundle budget

The guest camera has a hard **30 KB gzipped** budget, enforced as a build failure:

```bash
npm run size --workspace guest
```

Currently **7.9 KB**. This is the reason the guest app is Preact rather than React Native for Web — see `DESIGN.md` non-negotiable #3.

## One product, one account, two bundles

To the person using it there is a single app on a single domain. The entry path decides the role — nobody ever picks one:

```
luma.de/join/LUMA01   →  guest camera bundle    8 KB gzipped
luma.de/*             →  host app bundle       97 KB gzipped and growing
```

There is **one account type**. The same `User` hosts their own wedding and attends a friend's; the role lives on the event via `Participant.user`, which is nullable because an account is never required to capture. In production this is one routing rule at the edge; in dev the two servers run on different ports.

The split exists because the React Native Web runtime alone is ~97 KB gzipped before any feature exists — measured, not estimated — against 7.9 KB for the entire guest camera. Code-splitting can't remove it; it's the framework, not the features.

## Email

Local development uses **Mailpit** (http://127.0.0.1:8035) and nothing leaves the machine.

For real delivery, `EMAIL_BACKEND` is env-selectable. An Azure Communication Services adapter ships in `apps/notifications/backends/azure_acs.py`:

```bash
uv sync --extra azure    # the SDK is an optional dependency
```

```
EMAIL_BACKEND=apps.notifications.backends.azure_acs.AzureCommunicationEmailBackend
AZURE_ACS_CONNECTION_STRING=...   # or AZURE_ACS_ENDPOINT + AZURE_ACS_ACCESS_KEY
AZURE_ACS_SENDER=noreply@luma.de  # must be verified on a provisioned domain
```

Provision the ACS resource in an **EU data location**. Azure is a US-jurisdiction sub-processor, so it needs a DPA and an entry in the privacy policy (`CHECKLIST.md` §2), and deliverability to GMX and Web.de has to be measured before launch (§9).

## Notes

- **Shot reservation is server-side.** A shot is reserved before the pre-signed upload URL is issued and released if the upload never confirms. Never trust a client-side counter.
- **Photographs never pass through Django.** The browser uploads directly to object storage.
- **Face lookup is off by default**, globally (`FEATURE_FACE_LOOKUP`) and per event. An event marked `involves_minors` cannot enable it — enforced by a database `CheckConstraint`, not just application code.
- **Nothing third-party loads on the capture page.** No font CDN, no analytics, no icon library over the network.
