I reviewed the complete publicly linked Once website: homepage and product flow, pricing, wedding, party and brand-event pages, FAQ content, privacy policy, terms, blog index, and all seven published articles.

## What Once actually sells

Once is not primarily a photo-storage product. It sells a **digital disposable-camera experience** built around four ideas:

1. **Zero-friction participation:** guests scan a QR code or open a link and start taking photos without creating an account or installing the full app.
2. **Artificial scarcity:** the host can limit how many photographs each guest may take.
3. **Delayed gratification:** photographs can remain hidden until a configured reveal time.
4. **A cohesive aesthetic:** images can receive a shared “film” treatment rather than looking like a random cloud-upload folder.

The central emotional promise is: the professional photographer captures the official story, while guests capture the moments the host never saw. ([once.film][1])

That positioning is much stronger than “share event photos.”

---

# Product concept for your app

A good working definition would be:

> A premium private camera experience for weddings and events, where guests join instantly through a QR code, capture a limited number of candid photographs, and discover the complete album together after the event.

Your product has three different users:

### Host

The person creating and paying for the event.

They need to:

* create an event
* select the event type
* enter dates and reveal time
* choose a visual theme
* define the number of guest cameras
* define shots per guest
* configure privacy
* generate QR codes and printable cards
* moderate or remove content
* reveal, download and share the album

### Guest

The guest should not feel like they are “using event software.”

Their ideal flow is:

```text
Scan QR
→ See event cover
→ Enter name or nickname
→ Grant camera permission
→ Take photos
→ See remaining shots
→ Return to the event later
→ Receive or open the revealed album
```

No password. No app-store detour. No complicated upload screen.

#### Claiming a participation

Anonymous participation stays the default, but a guest should be able to *claim* their participation afterwards and keep it.

```text
Guest joins anonymously
→ takes photos
→ album reveals
→ “Keep these memories?”
→ verifies email or phone with a one-time code
→ the anonymous session is linked to an account
→ every event they attended appears under “My events”
```

Rules:

* the account is created **after** participation, never as a precondition for it
* claiming links existing participant records, it never creates new ones
* a returning guest with an active session is offered the link on any future event
* an account holder gets a personal timeline: every event they attended, their own photographs, and the albums they still have access to
* losing the device stops being fatal — the account restores access
* deleting the account deletes or anonymises every linked participation
* an account grants no extra rights inside an event; visibility is still governed entirely by the host's settings

### Event operator

For weddings, venues and corporate clients, you will eventually need an administrative role that can:

* manage multiple events
* create reusable branding
* order or export printed QR material
* manage billing
* moderate albums
* access engagement statistics
* export content and consent records

---

# Core experience

## 1. Event creation

The host creates an event with:

* event name
* event type
* event date and timezone
* capture start
* capture end
* album reveal time
* cover image
* visual theme
* default camera filter
* guest capacity
* shots per guest
* album visibility
* guest download permissions
* face lookup, off by default
* whether the event involves minors, which disables face lookup outright
* whether children's faces are blurred — a separate protective measure, on by default once minors are declared

Once describes a similar host-controlled model: event hosts determine visibility, participant limits and reveal time. ([once.film][2])

## 2. Invitation

Generate:

* short event URL
* QR code
* downloadable PNG and SVG
* printable A4/A5 signs
* table-card PDFs
* social-sharing image
* WhatsApp invitation
* optional NFC link

The QR code should contain a revocable public token, not the internal event ID.

For example:

```text
https://yourapp.com/join/7H2KMX
```

## 3. Guest identity

For the first release, guests should enter only:

* display name
* optional email or phone number for reveal notification
* consent checkbox

Create an anonymous guest session stored in:

* a signed HTTP-only cookie
* local browser storage as a recovery mechanism
* a server-side guest-session record

The guest should be able to return using the same device without entering their name again.

### Identity levels

The system recognises three escalating levels of identity and never forces a jump between them.

| Level                   | Identifier                     | Survives                       | Used for                          |
| ----------------------- | ------------------------------ | ------------------------------ | --------------------------------- |
| Anonymous session       | signed cookie + local storage  | same browser, same device      | capture, shot counting            |
| Contactable participant | + verified email or phone      | device loss, within one event  | reveal notification               |
| Account                 | + one-time code, passkey or password | indefinitely, across events | “My events”, cross-event history  |

### One account, roles per event

There is **one account type**, not a host account and a guest account. Somebody who runs their own wedding in June and attends a friend's in August is one person with one login, and the product must never make them prove it twice.

A role belongs to the *event*, never to the person:

```text
Christoph (one account)
├── host        of "Anna & Ben"
├── participant in "Mira & Jonas"
└── participant in "Firmenfeier 2027"
```

**The entry point decides the role, and the person never chooses it.** Scanning an event QR code makes you a participant in that event — there is no "join as host or guest?" screen, exactly as there is no "log in or register?" tab. Opening the app without a join code puts you in your own events.

Implementation notes:

* `Participant` is the per-event record; it carries an optional link to an account
* **an account is never required to participate.** A guest with no account captures anonymously and can claim afterwards — the rule from the previous section is unchanged
* a signed-in person scanning a QR code joins in one tap, with their name already known and nothing retyped
* claiming must be idempotent — the same address claiming twice must not duplicate participations
* one account may own several participants in the same event only if they were captured on different devices; offer a merge rather than silently combining
* never merge participants automatically on a matching display name
* an unclaimed participant with a verified email should receive a claim link alongside the reveal notification
* account deletion must cascade correctly: photographs the guest took stay in the host's album if the host's terms say so, but attribution and contact data are removed

## 4. Account creation in the web app

Every account is created **in the browser**, and creating one must be genuinely easy: under a minute, one-handed, on a phone, on venue wifi. There is never an app-store detour to sign up, and the native host apps are a convenience, never a requirement.

The bar: *if someone abandons sign-up, that is a bug in the flow, not a lack of motivation.*

### Host sign-up

* **Email address plus a one-time code, or a passkey.** A password is offered, never required
* **Two screens, one field each:** email, then the six-digit code. No name, no company, no phone number, no “confirm password”, no CAPTCHA on the happy path
* **The code is the verification.** There is no separate “please confirm your email” wall between signing up and using the product
* **Sign-up comes after the work, not before it.** A host can open the marketing site, configure an entire event and see their theme preview before being asked for anything. The account is requested at save or at payment, and everything configured up to that point survives the sign-up
* **One entry point for login and registration.** The visitor types their email; the system decides whether this is a returning host or a new one. Nobody should have to pick the correct tab
* **Passkey is offered after the first successful login**, as an upgrade, never as an obstacle during it
* **Social sign-in is a shortcut, not the path.** If Google/Apple sign-in ships, it stays optional: it is a third-party request on a privacy-first product and it puts the customer relationship in someone else's hands
* An unfinished sign-up is recoverable — the same link or code works if they come back ten minutes later

### Guest sign-up (claiming)

The rule from the previous section stands: the account is created **after** participation, never as a precondition for it. The mechanics are the same as the host's, only shorter.

* one tap on “Keep these memories”, one code, done — there is no password step at any point
* the claim link in the reveal email logs them in directly; it does not drop them on a login form
* the anonymous session already knows who they are, so nothing is retyped
* a guest who declines keeps full access to the album for the event's retention period; declining costs them nothing

### Rules for both

* **Every failure state says what to do next.** Code expired, code wrong, mail not arrived — each with a resend that actually resends and a visible cooldown
* **Speed is deliverability, not code.** A one-time code that arrives in 40 seconds feels broken no matter how good the screen is; this is why the email provider in §9 of the checklist is a launch-blocking choice
* The code input supports paste and OS autofill (`autocomplete="one-time-code"`), works at 200 % text size, and is reachable with a screen reader
* Rate limiting and short code expiry replace CAPTCHA, so the happy path stays clean
* Creating an account **never** creates a second identity for someone who already has one — a matching verified address links, it does not duplicate
* **Deleting the account is as easy as creating it**, reachable from inside the web app in two taps, with no support email in the loop

## 5. Camera

The camera is the heart of the product.

Minimum features:

* rear/front camera selection
* flash control where supported
* portrait and landscape capture
* visible shot counter
* image preview
* retake before submission
* automatic upload
* upload retry
* offline queue
* event-specific filter
* EXIF stripping
* image orientation correction

The most important UX decision is whether guests may upload existing images. A strict disposable-camera experience should initially allow only newly captured images. A less restrictive event album can optionally allow camera-roll uploads.

I would make this configurable:

```text
Capture mode:
○ Camera only
○ Camera and existing photos
○ Upload only
```

## 6. Hidden-photo experience

Before reveal, the guest should see something like:

```text
12 of 20 moments captured

Your photos are developing.
The album will reveal Sunday at 12:00.
```

Possible host settings:

* photos visible immediately
* guests see only their own photos
* host sees everything, guests wait
* nobody sees anything until reveal
* host manually triggers reveal

The delayed reveal is one of Once’s strongest differentiators and is repeatedly emphasized in its product presentation and reviews. ([once.film][1])

## 7. Album reveal

The reveal should feel like a product moment, not merely a gallery becoming accessible.

Suggested sequence:

```text
Event countdown reaches zero
→ “Your memories are ready”
→ short animated film-roll opening
→ automatically generated highlight reel
→ chronological album
→ guest perspectives
→ downloads and reactions
```

Album features:

* chronological gallery
* grid and slideshow modes
* photographer attribution
* favorites
* reactions
* comments, preferably optional
* download individual image
* download complete ZIP
* host-curated highlights
* shareable album link
* printable photo-book export
* automatic recap video

Once already references recap videos, digital album export and prints, so these are meaningful competitive expectations rather than cosmetic extras. ([once.film][1])

## 8. Find my photos — optional face lookup

An opt-in face lookup that lets a guest retrieve the photographs they appear in, including the ones taken by people they never spoke to. It is the feature that turns a shared album into *their* album.

Concretely, and this is the whole feature: **the guest scans their own face with the phone camera, and the album filters down to the photographs they are in.** Nobody scans anyone else. There is no “find this person” tool for the host, no name attached to a face, and no search across events — a scan answers exactly one question, *where am I*, for exactly one album, for the person holding the phone.

**Optional twice over.** The feature is off by default and must be switched on per event by the host; and even then no guest is enrolled unless they personally ask to be. Neither switch is ever pre-ticked, and the product must be complete and coherent with the feature disabled.

One rule governs the whole design: **only the person being recognised may ask.** The host never gets a face-search tool, and no face is enrolled without its owner's explicit request.

### Guest flow

```text
Album reveals
→ “Find photos of yourself?”   (opt-in, never pre-ticked)
→ explicit biometric consent screen, plain language
→ guest takes a reference selfie
→ processing, a few seconds
→ “We found you in 34 photographs”
→ guest reviews and unticks any wrong matches
→ selfie and its embedding are deleted
→ what remains is a saved list, not a stored face
```

### What is stored, and for how long

| Data                          | Where                                | Lifetime                                          |
| ----------------------------- | ------------------------------------ | ------------------------------------------------- |
| Reference selfie              | never written to permanent storage   | deleted the moment its embedding is computed      |
| Reference embedding           | Postgres / pgvector, EU region       | deleted immediately after the match run completes |
| Face detections in event photos | Postgres / pgvector, EU region     | until the event's retention date                  |
| Match result                  | Postgres                             | until the guest or host deletes it                |

Face detections have to be computed across every photograph in an enabled event, because matching cannot work otherwise. That is the part needing the most careful disclosure: it processes people who did not themselves opt in. Mitigations:

* off by default, enabled per event by the host
* the host must confirm they have told their guests, and the join screen states it plainly before the guest takes a single photograph
* a detection stores a bounding box and a vector, never a name — a vector is only ever resolved against a reference the subject supplied themselves
* the vector is not reversible into an image and is never exposed through the API
* any guest may request exclusion, which suppresses detections in photographs they appear in
* everything is purged with the event

### Pipeline

```text
Photo accepted
→ Celery task on the inference queue: detect faces (SCRFD / RetinaFace)
→ per face: quality filter, align, embed (ArcFace via ONNX Runtime)
→ store detection + 512-d vector in pgvector

Guest opts in
→ selfie → same detect / align / embed path
→ cosine search against detections for that event only
→ threshold + top-k, never a global search
→ return matches for human confirmation
→ delete the reference embedding
```

Notes:

* run inference on a **separate worker queue** — it is the only CPU-heavy job in the system and must never block thumbnailing or uploads
* scope every query by `event_id` at the database level; a cross-event face search should be impossible to express, not merely disallowed
* store `model_version` on every embedding, because a model upgrade invalidates all of them
* set the threshold conservatively and always let the guest reject matches — a false positive here is a privacy incident, not a UX papercut
* if the host marks an event as involving minors, disable the feature entirely

### Blurring children's faces

A distinct feature from lookup, and the two must not be confused — they have
opposite purposes and therefore different rules.

| | Face lookup | Blurring children |
| --- | --- | --- |
| Purpose | find the photographs a person appears in | remove a child from what anyone sees |
| Processing | detect, embed, **match against a stored reference** | detect, estimate whether it is a child, destroy |
| Stored | a 512-d template, until the match completes | nothing |
| Who may trigger it | only the subject, by explicit consent | the host, for the whole event |
| At an event with minors | **forbidden** | **on by default** |

One finds people; the other hides them. Art. 25 — data protection by design —
actively favours the second, and in Germany blurring is a recognised way to
handle the § 22 KUG problem of photographing other people's children.

Rules:

* the blur is applied to the derivative that is served, so an unblurred face
  is never delivered to a viewer, a download or an export
* it is on by default the moment a host declares that children will be
  photographed; turning it off is a deliberate act
* no template is stored and no child is identified — an age estimate is made
  and immediately discarded with the detection
* it still infers from a face, so it needs its own section in the DPIA and its
  own plain-language line in the privacy policy
* a false negative is the dangerous failure, so the threshold leans towards
  blurring, and the host gets a moderation view to blur anything missed

### Legal prerequisites

* a DPIA before the feature ships; this is Art. 35 territory
* explicit consent under Art. 9(2)(a), recorded with policy version and timestamp
* EU-only inference and EU-only vector storage, self-hosted rather than a third-party face API
* a plain-language explanation on the consent screen itself, not a link to the privacy policy
* withdrawal of consent deletes the enrollment and its results within the same request

---

# MVP scope

I would keep the first release narrower than Once.

## Host application

A responsive web application or mobile-first PWA:

* account registration — email + one-time code or passkey, no password required, per §4
* event creation
* theme selection
* guest and shot limits
* reveal settings
* payment
* QR generation
* live participation counter
* basic photo moderation
* album reveal
* ZIP export

## Guest application

A web application:

* QR-based entry
* nickname entry
* consent
* browser camera
* photo capture
* retry-safe upload
* remaining-shot counter
* reveal countdown
* album viewing
* optional account claim after the reveal — one tap plus one code, no password
* “My events” history for claimed accounts

## Administration

* user management
* event search
* photo deletion
* abuse reports
* payment status
* event capacity adjustment
* support impersonation with audit trail
* storage and upload monitoring

## Do not include in the first MVP

* native guest application
* face lookup — designed now, shipped in Phase 3, because the consent, retention and deletion plumbing has to exist and be proven before biometrics are switched on
* host-side face grouping, or any face search the subject did not personally request — not deferred, but ruled out
* public social feed
* complex comments
* physical photo-book fulfillment
* advanced corporate white-labelling
* video uploads
* photographer marketplace
* live guest chat

---

# Recommended architecture

Given your previous preference for Django-based systems, this is a suitable architecture.

```text
Marketing site          Host application         Guest camera
Next.js (static, SEO)   Expo / React Native      Preact + Vite
                        iOS · Android · Web      web only, 30 KB budget
        │                        │                       │
        └────────────────────────┴───────────────────────┘
                                 ▼
                      Django + Django Ninja API
                                 │
        ├── PostgreSQL + pgvector
        ├── Redis
        ├── Celery workers
        ├── Inference worker (ArcFace ONNX, separate queue)
        ├── S3-compatible object storage (EU region)
        ├── CDN
        ├── Email/SMS provider
        └── Payment provider
```

## Frontend

**One product, one domain, one account — two bundles.**

To the person using it there is a single app. They scan a code or open the site; they never choose a role, never pick between apps, never hold two logins. Underneath, the entry path decides which bundle is served:

```text
luma.de/join/LUMA01   →  guest camera bundle    ~8 KB gzipped
luma.de/*             →  host app bundle       ~97 KB gzipped and growing
```

The split is not a product decision, it is a physics one. The React Native Web runtime alone is roughly 97 KB gzipped before a single feature exists — measured, not estimated — against 7.9 KB for the whole guest camera. Code-splitting cannot remove it, because it is the framework rather than the features. Shipping one bundle would put a ~40× download in front of a guest standing in a cellar with one bar of reception, which is the exact situation differentiator #3 exists for.

So the seam is at the edge, not in the experience:

* one domain, one set of cookies, one session token
* one account, with the role decided by the URL (see “One account, roles per event”)
* one design-token package, so both bundles render identically
* one generated API client from the same OpenAPI schema

If the guest camera is ever rebuilt in Expo, it must be because a measurement said it was safe — not because one codebase felt tidier.

### Host — Expo (React Native + React Native for Web)

The host application is ordinary CRUD: create an event, configure it, watch a counter, moderate, reveal, export. One Expo codebase serves iOS, Android and the browser, which means native host apps stop being a separate project and become a build target.

* Expo, managed workflow
* Expo Router
* TypeScript
* TanStack Query
* NativeWind, so Tailwind syntax works across native and web
* `expo-notifications` for reveal and moderation alerts
* EAS Build and EAS Update for release and over-the-air fixes

“My events” lives here too — every event the account has hosted or attended, the same screen on all three targets.

### Guest — Preact + Vite, web only

The guest camera is deliberately **not** React Native, for three reasons:

1. **Bundle size is the product.** React Native for Web ships several hundred kilobytes before your own code runs. A wedding cellar with one bar of reception is the normal case, not the edge case; a ~25 KB entry page loads there and a ~250 KB one often does not. “Better offline behaviour” is differentiator #3 and it starts with the first byte.
2. **React Native does not give you the camera.** On the web target you still write `getUserMedia()` by hand. Sharing the codebase would mean maintaining `expo-camera` *and* `getUserMedia` for the same screen — the hardest component in the product gets written twice instead of once.
3. **“No install” is a promise.** The guest path must never touch an app store, so the browser is the only guest target that matters.

Use:

* Preact, or React aliased to Preact, with Vite
* `getUserMedia()` for browser camera access
* IndexedDB for pending uploads
* service worker for retry and caching
* direct-to-object-storage uploads
* resumable or multipart upload where needed
* no analytics SDK, no font CDN, no third-party script whatsoever on the capture page

A normal web page can satisfy “no download,” but browser camera functionality and background uploads vary between iOS and Android. This must be tested early on real Safari and Chrome devices.

### Shared

* an OpenAPI client generated from Django Ninja and consumed by all three frontends
* design tokens — colour, spacing, type scale, film themes — in a shared package, so a theme renders identically in the guest camera and in the host's preview of it

Apple App Clips could later improve the iOS experience, which Once itself uses, but they introduce native iOS work and should not be required for the MVP. Once’s privacy policy explicitly describes an App Clip used for joining a film and uploading photos. ([once.film][3])

## Backend

Suggested Django applications:

```text
accounts          host and staff users
                  (no separate app — there is one account type, see accounts)
organizations
events
participants
invitations
camera_sessions
media
albums
faces             opt-in detection, enrollment, matching
moderation
notifications
billing
exports
audit
```

## Storage

Do not upload full images through Django.

Recommended flow:

```text
1. Guest requests upload slot
2. API validates event and shot allowance
3. API creates pending media record
4. API returns pre-signed object-storage URL
5. Browser uploads directly
6. Browser confirms upload
7. Worker validates and processes image
8. Media becomes accepted
```

Store:

* original image in a private bucket
* optimized display derivative
* thumbnail
* optional filtered version
* optional print-resolution version

Use signed CDN URLs for private albums.

## Background processing

Celery jobs:

* virus/file validation
* EXIF removal
* orientation normalization
* thumbnail generation
* filter rendering
* duplicate detection
* moderation scanning
* ZIP generation
* reveal notifications
* recap-video generation
* retention/deletion processing

On a separate `inference` queue, only for events with face lookup enabled:

* face detection and embedding of accepted photographs
* reference-selfie embedding and match runs
* embedding purge on consent withdrawal, exclusion request or event expiry

Keep this queue isolated. It is the only CPU-heavy work in the system, and a backlog of face jobs must never delay a guest's thumbnail.

---

# Initial data model

```text
User                             one account type — host and guest alike
- id
- email                          the identity; there is no username
- display_name
- password_hash                  optional; sign-in is a code or a passkey
- email_verified_at
- created_at

Organization
- id
- name
- owner_id
- billing_profile_id

Event
- id
- organization_id
- host_id
- title
- event_type
- timezone
- capture_starts_at
- capture_ends_at
- reveals_at
- status
- guest_capacity
- shots_per_guest
- visibility_mode
- capture_mode
- theme_id
- public_slug
- join_token_hash
- face_lookup_enabled          (default false)
- involves_minors              (forces face_lookup_enabled false)
- retention_expires_at

Participant                      one person's role in one event
- id
- event_id
- user_id                        null while anonymous; set on claim or on a
                                 signed-in join. Never required to capture.
- display_name
- email
- phone
- anonymous_session_id
- joined_at
- last_seen_at
- shot_limit
- shots_committed
- consent_version

CameraSession
- id
- participant_id
- device_identifier_hash
- user_agent
- created_at
- expires_at

MediaAsset
- id
- event_id
- participant_id
- storage_key
- original_filename
- mime_type
- width
- height
- byte_size
- captured_at
- uploaded_at
- processing_status
- moderation_status
- visibility_status
- checksum

MediaDerivative
- id
- media_asset_id
- derivative_type
- storage_key
- width
- height

Theme
- id
- name
- filter_configuration
- cover_configuration

Invitation
- id
- event_id
- token_hash
- label
- expires_at
- maximum_uses
- usage_count

Reaction
- id
- media_asset_id
- participant_id
- reaction_type

Purchase
- id
- event_id
- provider
- provider_transaction_id
- amount
- currency
- status
- purchased_capacity

ExportJob
- id
- event_id
- requested_by
- format
- status
- storage_key
- expires_at

ConsentRecord
- id
- event_id
- participant_id
- policy_version
- consent_type
- accepted_at
- ip_hash

ParticipantClaim
- id
- participant_id
- user_id                      (the same User as a host — one account type)
- claim_method                 (email_code | sms_code | passkey | session)
- claimed_at
  unique (participant_id)

FaceEnrollment
- id
- event_id
- participant_id
- embedding                    (vector 512, deleted after matching)
- model_version
- consent_record_id
- created_at
- expires_at

FaceDetection
- id
- media_asset_id
- event_id                     (denormalized, scopes every query)
- bounding_box
- quality_score
- embedding                    (vector 512)
- model_version
- created_at

FaceMatch
- id
- face_enrollment_id
- face_detection_id
- similarity
- confirmed_by_participant     (null until reviewed)

FaceExclusion
- id
- event_id
- participant_id
- requested_at

AuditLog
- id
- actor_id
- event_id
- action
- object_type
- object_id
- metadata
- created_at
```

A crucial implementation detail is the shot counter. Never rely solely on a client-side value. Reserve a shot server-side before issuing the upload URL, and release the reservation when an upload fails or expires.

---

# Privacy and legal design

This product processes personal photographs and potentially images of children, so privacy must be part of the architecture.

At minimum:

* private albums by default
* non-guessable join tokens
* encrypted transport and storage
* configurable deletion date
* host deletion controls
* guest data-access and deletion workflow
* explicit disclosure of who may view uploaded photos
* consent/version records
* data-processing agreements with vendors
* European data residency where possible
* no advertising-based tracking in guest sessions
* clear distinction between personal and commercial event use
* audit logging for administrative access

Once states that uploaders retain ownership, while the host receives a limited licence to operate, view, share and export the event album. It separately requires uploader permission for commercial use. That distinction becomes particularly important for corporate events. ([once.film][2])

For a European product, I would improve on Once by offering:

* EU-only hosting
* automatic event expiration
* event-specific retention periods
* no session-replay analytics on guest camera pages
* optional guest removal request
* content export and deletion self-service
* separate commercial-content consent
* face lookup off by default, subject-initiated only, self-hosted in the EU, with reference biometrics destroyed on completion
* one account that lets a person see and delete their own history across every event they hosted or attended

Once discloses Supabase, RevenueCat, PostHog and Vercel as vendors, and says data may be processed in the United States and other countries. ([once.film][3])

---

# Business model

Once uses event-based capacity pricing rather than a recurring consumer subscription. The free tier permits up to five participants, with paid capacity steps through 200 participants and custom pricing beyond that. ([once.film][4])

I would use:

| Package      | Guests | Suggested price |
| ------------ | -----: | --------------: |
| Trial        |      5 |            Free |
| Intimate     |     25 |             €19 |
| Celebration  |     50 |             €29 |
| Wedding      |    100 |             €49 |
| Wedding Plus |    200 |             €79 |
| Professional |    500 |            €149 |
| Brand        | Custom |       From €299 |

Potential add-ons:

* additional storage duration
* video support
* premium film filters
* recap video
* custom printed QR package
* photo-book credit
* custom domain
* removal of your branding
* corporate usage rights
* venue dashboard

The strongest longer-term business is likely not one-off consumer purchases alone. It is a hybrid model:

```text
Consumer:
One-time payment per event

Wedding planners and venues:
Monthly or annual partner subscription

Brands and agencies:
Per-event professional pricing

Photo-book and print fulfilment:
Revenue share or margin
```

---

# How your product should differ

A clone would be easy to compare and difficult to defend. I would position yours around **European privacy, premium design and reliability**.

Potential differentiators:

### 1. Privacy-first European hosting

“Your private event does not become advertising data.”

### 2. No host app required

Once strongly directs hosts toward its native app. Your hosts could create and administer everything through the browser, while optional native apps can come later.

### 3. Better offline behaviour

Wedding venues frequently have poor mobile reception. Store photographs locally and transparently retry uploads.

### 4. Premium reveal experience

Produce:

* cinematic reveal
* chronological event story
* automatic highlight selection
* recap video
* printable album
* “through each guest’s eyes” mode

### 5. Venue and planner platform

Let a venue create 100 branded events per year with:

* reusable templates
* logo and colour configuration
* event duplication
* client handover
* staff access
* invoices
* aggregate analytics

### 6. Consent-first face lookup

Guests can optionally locate the photographs they appear in, using EU-hosted, self-run face matching — never a third-party face API. The differentiator is not the recognition itself, which is commodity technology, but the fact that **only the subject can ask**: the host gets no face-search tool, no face is enrolled without its owner requesting it, and the reference selfie and its embedding are destroyed as soon as the match completes. See “Find my photos” above.

Sold correctly, this is the sharpest possible expression of the privacy positioning: the same feature everyone else ships as surveillance, shipped as a service to the person being recognised.

---

# Delivery phases

## Phase 1: Technical proof of concept

Prove the risky parts first:

* QR join
* iOS Safari camera
* Android Chrome camera
* direct image upload
* offline queue
* browser-session restoration
* shot enforcement
* delayed reveal
* private signed album URLs
* Expo web and native builds of the host shell from one codebase
* guest-camera bundle budget verified on a real 3G connection, not a throttled desktop

## Phase 2: MVP

* host accounts, created entirely in the web app per §4 — passwordless sign-up, single email/login entry point
* event configuration
* billing
* QR materials
* guest camera
* album reveal
* downloads
* email notifications
* moderation
* GDPR workflows
* participation claiming and “My events”, on the same account as hosting
* native host apps via EAS, since the codebase already produces them

## Phase 3: Premium product

* film themes
* recap videos
* guest reactions
* print integration
* host-curated highlights
* custom branding
* planner and venue accounts
* optional face lookup, gated behind a completed DPIA

## Phase 4: Commercial platform

* multi-tenant organizations
* white-label events
* agency billing
* API and webhooks
* branded domains
* large event ingestion
* commercial usage consent
* advanced analytics

The most important technical spike remains the guest-camera experience on iOS Safari.

The frontend question is now settled: the guest stays a pure browser experience on a minimal bundle, and the host is an Expo application producing iOS, Android and web from one codebase. An App Clip or native guest experience stays open as a later iOS refinement, not an MVP requirement.

That leaves two open decisions, both about face lookup rather than architecture:

1. Whether the feature is worth the compliance surface at all. It is the strongest differentiator in the document and the only one that can generate a regulatory incident. The answer should come from talking to a data-protection lawyer and to five real hosts, not from the backlog.
2. Whether hosts will accept that they cannot search faces themselves. Every competitor offers it; refusing is the positioning. That refusal needs to be tested against real wedding photographers and venues before Phase 3 is scheduled.

Everything else is relatively conventional once those are validated.

[1]: https://once.film/ "Once: Disposable Camera for Your Precious Moment"
[2]: https://once.film/terms "Terms"
[3]: https://once.film/privacy "Privacy"
[4]: https://once.film/pricing "Simple One Time Pricing"
