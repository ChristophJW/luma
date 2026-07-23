# Luma — Launch Checklist

End-to-end, from validation to the first paying wedding. Companion to `CONCEPT.md` and `DESIGN.md`.

Sections marked **GATE** are hard stops. Do not start the next section until the gate passes — each one can invalidate work downstream.

### Timing

Today is **July 2026**. European wedding season peaks May–September, and couples book their suppliers **6–12 months ahead**. That means:

- Launching in autumn 2026 catches couples booking the **2027 season** — the right window.
- Launching in spring 2027 misses it by a year.
- Target: **live and taking money by January 2027**, with a pilot wedding behind you.

---

## 0. Validation — before you write production code · GATE

The concept is well reasoned but entirely unvalidated. Two of these can kill the project cheaply, which is the point.

- [ ] Build the iOS Safari camera spike. Nothing else matters if this is bad.
- [ ] Test `getUserMedia()` on a real iPhone, not the simulator, not desktop responsive mode
- [ ] Confirm capture → upload → recovery survives the browser being backgrounded mid-upload
- [ ] Confirm an iOS PWA / home-screen page does not lose the session or the IndexedDB queue
- [ ] **Test inside the WhatsApp and Instagram in-app browsers.** QR links get forwarded in chat; if `getUserMedia` is blocked there, you need an "open in Safari" interstitial and you need to know now
- [ ] Talk to 5 real hosts — recently married, planning, or a wedding planner
- [ ] Do they understand "limited shots" as charming or as broken?
- [ ] Would they pay €49? Ask for the number, not for approval
- [ ] What do they currently do instead — and is it a shared Google Photos album?
- [ ] Talk to 2 wedding photographers. They can champion or kill this with their clients
- [ ] Confirm nobody insists on host-side face search (see `CONCEPT.md` closing section)
- [ ] Check `luma` naming: EUIPO trademark search, `.com` / `.de` availability, App Store name collision
- [ ] Sanity-check unit economics: 100 guests × 20 shots × ~4 MB original + derivatives ≈ 10–12 GB per event. At €49 with 12-month retention, storage and egress must be a small fraction of revenue

**GATE:** iOS Safari camera works reliably, including in-app browsers, and 3 of 5 hosts named a price ≥ €29 unprompted.

---

## 1. Company and legal foundation

Germany / EU specifics. Do this early — some items have lead times measured in weeks.

- [ ] Legal entity decided (Einzelunternehmen vs. UG vs. GmbH) and registered
- [ ] Business bank account
- [ ] Tax number and, if applicable, USt-IdNr.
- [ ] **VAT strategy for EU digital sales decided.** Selling B2C digital services across the EU means charging the customer's local VAT rate. Either register for **OSS (One-Stop-Shop)**, or use a merchant of record that handles it for you
- [ ] Kleinunternehmerregelung evaluated — and note it does not exempt you from OSS obligations on cross-border digital sales
- [ ] Liability insurance considered (Berufshaftpflicht), given you hold other people's wedding photographs
- [ ] `luma.de` / `.com` / `.eu` registered, plus the short join domain (see §4)

---

## 2. Legal documents · GATE

Have a lawyer review these. This product processes photographs of identifiable people who never signed up, which is genuinely non-trivial.

- [ ] **Impressum** — legally mandatory in Germany, on every page including the guest camera
- [ ] **Datenschutzerklärung / Privacy Policy**, EN + DE, covering:
- [ ] guests as data subjects who never created an account
- [ ] photographs as personal data of everyone depicted, not just the uploader
- [ ] retention periods per event, and automatic deletion
- [ ] every sub-processor named, with location
- [ ] biometric processing, once face lookup ships (Art. 9)
- [ ] **AGB / Terms**, EN + DE, covering:
- [ ] ownership: the uploader keeps their photographs
- [ ] the licence the host receives to view, share and export
- [ ] separate, explicit permission required for commercial use
- [ ] what happens to an album when a host stops paying or deletes their account
- [ ] **Widerrufsbelehrung** — 14-day consumer right of withdrawal, plus the express waiver a host must give to get immediate access to a digital service
- [ ] **Verarbeitungsverzeichnis** (Art. 30 records of processing)
- [ ] **TOMs** documented (Art. 32)
- [ ] **AV-Verträge / DPAs signed** with every processor: hosting, object storage, email, SMS, payments, error tracking
- [ ] Guest-facing consent text written in plain language and versioned, so `ConsentRecord.policy_version` means something
- [ ] Cookie / tracking banner assessed under TTDSG — and confirm the guest camera page needs **no banner at all**, because it sets no non-essential storage. This is a feature; make sure it stays true

**GATE:** privacy policy, terms and DPAs reviewed by a lawyer with GDPR experience.

---

## 3. Infrastructure and environments

- [ ] EU region chosen and **verified** for every service — hosting, database, object storage, CDN edge, backups, logs
- [ ] Providers selected (Hetzner / Scaleway / OVH are the credible EU options)
- [ ] Environments: local, staging, production — with separate storage buckets and separate payment keys
- [ ] PostgreSQL provisioned, with `pgvector` available for later face work
- [ ] Redis provisioned
- [ ] Object storage buckets: private originals, private derivatives, public assets
- [ ] CDN in front of derivatives, with signed URLs for private albums
- [ ] Celery workers deployed, with the `inference` queue defined but empty
- [ ] CI/CD: tests, migrations, deploy, rollback path
- [ ] **Backups tested by actually restoring one.** An untested backup is not a backup
- [ ] Uptime monitoring with alerting to a phone
- [ ] Error tracking (self-hosted Sentry, or EU-hosted, with a DPA)
- [ ] Log retention policy set — and no photographs, tokens or IPs in plaintext logs
- [ ] Cost alerts on storage and egress

---

## 4. Backend

- [ ] Django apps scaffolded per `CONCEPT.md`
- [ ] Data model migrated, including `ParticipantClaim`, `FaceExclusion`, and `Participant.user` (one account type — see `CONCEPT.md`, "One account, roles per event")
- [ ] Django Ninja API with generated OpenAPI schema
- [ ] Generated API client published for the three frontends

**Core mechanics**

- [ ] Join tokens: non-guessable, revocable, not the internal event ID
- [ ] Short join domain live (`lum.ae/7H2KMX` or similar) — QR density matters on a printed table card
- [ ] Anonymous guest session: signed HTTP-only cookie + local storage recovery + server record
- [ ] **Shot reservation is server-side.** Reserve before issuing the upload URL; release on failure or expiry
- [ ] Reservation expiry job — a crashed browser must not permanently consume a shot
- [ ] Pre-signed direct-to-storage upload flow
- [ ] Upload confirmation endpoint, idempotent
- [ ] Duplicate detection by checksum
- [ ] Capture window enforcement (start, end, timezone-correct)
- [ ] Reveal logic, including manual host-triggered reveal
- [ ] Visibility modes all enforced server-side, never in the client
- [ ] Guest capacity enforcement tied to the purchased tier

**Processing**

- [ ] EXIF stripping — verify GPS is actually gone from the delivered file
- [ ] Orientation normalisation (the classic iPhone bug)
- [ ] Thumbnail and display derivatives
- [ ] Film theme rendering, matching the host preview exactly
- [ ] Child-face blurring baked into the served derivative, never applied client-side — and verified that no unblurred face reaches a download or a ZIP export
- [ ] File validation: real image, size limits, magic-byte check
- [ ] ZIP export generation, streamed, resumable, expiring link
- [ ] Retention and deletion jobs, actually deleting from object storage

**Accounts**

- [ ] Host authentication — passwordless by default, per `CONCEPT.md` §4
- [ ] One-time code issue/verify endpoint: short expiry, single use, rate limited, constant-time compare
- [ ] Single email entry point that resolves to login **or** registration server-side, without leaking whether an address exists
- [ ] Passkey (WebAuthn) registration and login, offered after the first successful sign-in
- [ ] Optional password as a fallback, never required to create an account
- [ ] Draft event survives sign-up — a host configures first, creates the account at save or payment, loses nothing
- [ ] Guest claiming of a participation, post-participation only, onto the same account type a host uses
- [ ] Participation claiming — idempotent, no duplicate claims
- [ ] Verified-address match links an existing identity instead of creating a second one
- [ ] "My events" across claimed participations
- [ ] Self-service account deletion from inside the web app, cascading correctly per the terms

---

## 5. Guest camera · GATE

The revenue path. Everything here is load-bearing.

- [ ] Bundle budget enforced in CI — build fails if the entry bundle exceeds target
- [ ] Zero third-party requests on the capture page, verified in the network tab
- [ ] QR scan → cover → name → consent → camera, with no dead ends
- [ ] Camera permission explainer before the browser prompt
- [ ] Permission-denied recovery with per-browser instructions
- [ ] In-app browser detection with an "open in Safari/Chrome" interstitial
- [ ] Front and rear camera, flash where supported
- [ ] Portrait and landscape
- [ ] Shot counter always visible, tabular figures, per `DESIGN.md` §5
- [ ] Preview and retake before commit
- [ ] IndexedDB offline queue
- [ ] Service worker retry with backoff
- [ ] Session restoration on return
- [ ] Waiting state and countdown
- [ ] Album view and reveal sequence, with a reduced-motion path
- [ ] Download individual and full ZIP
- [ ] Optional account claim after reveal — one tap plus one code, no password, and declining costs the guest nothing
- [ ] Works at 200% text size
- [ ] VoiceOver / TalkBack pass on the capture screen

**GATE:** 20 photographs captured and delivered from a real phone, on real venue wifi, with airplane mode toggled mid-session.

---

## 6. Host app

- [ ] Expo project building to iOS, Android and web from one codebase
- [ ] **Account creation in the web app takes under a minute, one-handed, on a phone.** Time it on a real device
- [ ] Two screens, one field each: email, then code. No name, company, phone, password confirmation or CAPTCHA on the happy path
- [ ] One combined entry point — the visitor types an email and never has to choose a "sign up" or "log in" tab
- [ ] No email-verification wall between signing up and using the product; the code is the verification
- [ ] Sign-up requested at save or payment, not before — the configured event is still there afterwards
- [ ] Code input supports paste and OS autofill (`autocomplete="one-time-code"`)
- [ ] Resend with a visible cooldown, and a stated recovery for: code expired, code wrong, mail not arrived
- [ ] Passkey offered after the first successful login, skippable
- [ ] Sign-up and login work at 200% text size and with a screen reader
- [ ] Account deletion reachable in two taps from inside the web app, no support email in the loop
- [ ] Event creation as a sequence, not a settings page
- [ ] Theme selection with true-to-output preview
- [ ] Guest capacity and shots per guest
- [ ] Reveal configuration with correct timezone handling
- [ ] `involves_minors` flag wired to disable face lookup
- [ ] QR generation: PNG, SVG, A4 and A5 signs, table-card PDF, WhatsApp share image
- [ ] Print output tested on an actual printer at actual size
- [ ] Live participation counter
- [ ] Moderation with 30-second undo
- [ ] Manual reveal trigger
- [ ] ZIP export
- [ ] Destructive actions behind typed confirmation
- [ ] Web build deployed; native builds via EAS can follow launch

---

## 7. Landing page and marketing site

Static Next.js, separate from the app. This is what a couple sees before they trust you with their wedding.

**Pages**

- [ ] Home
- [ ] How it works
- [ ] Pricing
- [ ] Weddings
- [ ] Parties and birthdays
- [ ] Corporate and brand events
- [ ] Privacy — a real page selling the EU story, not a link to the legal text
- [ ] FAQ
- [ ] Blog index + 3 launch articles
- [ ] Impressum, Datenschutz, AGB, Widerruf
- [ ] 404 and a maintenance page

**Home page must answer, above the fold**

- [ ] What is this — in one sentence a non-technical person understands
- [ ] What does a guest have to install — **nothing**, said explicitly
- [ ] What does it cost
- [ ] Where does the data live — Germany / EU, said plainly

**Content**

- [ ] Real photographs, not stock. Beg, borrow or shoot a styled session — stock wedding photography reads as fake instantly
- [ ] A short video or GIF of the actual guest flow: scan → shoot → reveal
- [ ] Sample album, publicly viewable, with real consent from everyone depicted
- [ ] The comparison against a shared Google Photos album — the real competitor
- [ ] German and English, both hand-written

**Technical**

- [ ] Lighthouse ≥ 95 on mobile
- [ ] OG images and Twitter cards
- [ ] `sitemap.xml`, `robots.txt`, structured data
- [ ] Canonical URLs and `hreflang` for DE/EN
- [ ] Analytics that need no cookie banner (EU-hosted, cookieless)
- [ ] Email capture for pre-launch interest
- [ ] All legal pages linked from the footer of every page

---

## 8. Payments

- [ ] Provider chosen. A merchant of record (Paddle, Lemon Squeezy) handles EU VAT for you; Stripe or Mollie means you handle OSS yourself
- [ ] Tiers configured per `CONCEPT.md` pricing table
- [ ] Free trial tier (5 guests) with no card required
- [ ] Capacity upgrade mid-event — a host **will** need this on the wedding day itself, and it must work in under a minute on a phone
- [ ] Webhooks handled idempotently
- [ ] Payment failure and retry
- [ ] Invoices with correct VAT treatment, downloadable
- [ ] Refund policy defined and implemented
- [ ] Test mode transactions verified end to end
- [ ] Live mode verified with one real €19 purchase from a different card

---

## 9. Notifications

- [ ] Transactional email provider with an EU DPA
- [ ] SPF, DKIM, DMARC configured and passing
- [ ] Deliverability tested to Gmail, Outlook, GMX and Web.de — the last two matter enormously in Germany
- [ ] Templates, EN + DE:
- [ ] host: welcome, purchase confirmation, event tomorrow, capture closed, album ready
- [ ] guest: reveal notification with claim link, ZIP ready
- [ ] account: verification code, login link, deletion confirmation
- [ ] **One-time codes measured end to end, not assumed.** Sign-up feels broken above ~10 seconds to inbox; test against the four German providers above
- [ ] Unsubscribe on everything non-transactional
- [ ] SMS provider, if phone reveal notifications ship at launch
- [ ] **Reveal notification send is batched and rate-limited.** 200 guests notified simultaneously is a thundering herd against the album

---

## 10. Security

- [ ] HTTPS everywhere, HSTS
- [ ] CSP on all surfaces, strictest on the capture page
- [ ] Rate limiting: join attempts, upload slot requests, login, account claiming
- [ ] Join token brute-force protection
- [ ] Signed CDN URLs with short expiry for private albums
- [ ] Direct object-storage access blocked; buckets not public
- [ ] IDOR audit — can participant A read participant B's photographs by changing an ID?
- [ ] Cross-event data leakage test, especially anything scoped by `event_id`
- [ ] Admin impersonation writes an audit log entry, always
- [ ] Secrets in a vault, not in the repo
- [ ] Dependency scanning in CI
- [ ] External penetration test, or at minimum a thorough second-pair-of-eyes review

---

## 11. Device matrix · GATE

The single highest-risk area. Real devices only.

| Device | Browser | Must pass |
| --- | --- | --- |
| iPhone 12+ | Safari, current iOS | full flow |
| iPhone SE (small screen) | Safari | layout, shutter reachable |
| iPhone, older iOS | Safari, one major version back | full flow |
| iPhone | WhatsApp in-app browser | interstitial or full flow |
| iPhone | Instagram in-app browser | interstitial or full flow |
| Android flagship | Chrome | full flow |
| Android mid-range, 3+ years old | Chrome | full flow, acceptable performance |
| Samsung | Samsung Internet | full flow — large share in Germany |
| Android | WhatsApp in-app browser | interstitial or full flow |
| Desktop | Chrome, Safari, Firefox | album viewing, host app |

- [ ] Every row passes
- [ ] Tested on 3G throttling, not just fast wifi
- [ ] Tested with the phone locking mid-upload
- [ ] Tested with a nearly full device storage
- [ ] Tested at 4% battery in low-power mode — iOS throttles background work

**GATE:** every row passes, or has a documented, designed fallback.

---

## 12. Load and failure testing

Model the actual shape of this product: a slow trickle for hours, then two enormous spikes.

- [ ] **Capture spike** — 100 guests uploading during a 20-minute first dance
- [ ] **Reveal spike** — 200 guests opening the album within 5 minutes of the notification
- [ ] ZIP generation for a 2,000-photograph event, without exhausting worker memory
- [ ] Object storage rate limits under concurrent pre-signed uploads
- [ ] Database connection pool under the reveal spike
- [ ] Failure drills, deliberately triggered:
- [ ] object storage unavailable during capture — do queued photos survive?
- [ ] Redis restarts mid-event
- [ ] a worker dies mid-ZIP
- [ ] payment webhook arrives twice
- [ ] payment webhook never arrives
- [ ] the reveal timer fires while the event is being edited

---

## 13. Compliance operations

Not documents — working mechanisms.

- [ ] Guest data-access request workflow, and someone who owns it
- [ ] Guest deletion request workflow, cascading to object storage
- [ ] Host deletion of an entire event, verified gone from storage and CDN
- [ ] Automatic retention expiry running and verified on a test event
- [ ] Consent records written with the correct policy version
- [ ] Data-breach response plan, with the 72-hour notification path written down
- [ ] Sub-processor list published and kept current
- [ ] Confirm no session-replay or behavioural analytics on guest pages

---

## 14. Support and operations

- [ ] Support email, monitored, with a stated response time
- [ ] Help centre covering the top 10 predictable questions
- [ ] **A wedding-day escalation path.** A host whose QR code fails during the reception is the worst possible support ticket. Decide now whether you answer the phone on Saturdays
- [ ] Status page
- [ ] Admin tools: find event, find participant, adjust capacity, delete photo, impersonate with audit
- [ ] Runbook for the three most likely incidents
- [ ] On-call expectations set, even if on-call is just you

---

## 15. Pilot · GATE

Do not launch without this.

- [ ] Run one **real wedding** end to end. A friend's, at cost or free, with informed consent
- [ ] Be physically present, or have someone who can be reached instantly
- [ ] Watch guests actually use it without help — do not intervene, take notes
- [ ] Count the failure points: how many guests failed to join, and why
- [ ] Interview the host the following week
- [ ] Interview 3 guests who are not technical
- [ ] Fix everything that broke before taking money

**GATE:** one real wedding completed with no data loss and no unresolved guest-blocking failure.

---

## 16. Launch

- [ ] Pricing live and verified in production
- [ ] Free tier working without a card
- [ ] All legal pages live and linked
- [ ] Monitoring and alerts confirmed firing
- [ ] Backups running on production
- [ ] A rollback that you have practised
- [ ] Someone available for the first 48 hours
- [ ] Launch channels prepared: personal network first, wedding forums, Hochzeitsplaner communities, r/weddingplanning, Product Hunt if it fits
- [ ] Reach out to the wedding planners and venues you spoke to in §0
- [ ] Press kit: screenshots, logo, one-paragraph description, founder photograph

---

## 17. First 30 days

- [ ] Watch the funnel: QR scans → joins → first photo → completed roll → album opened
- [ ] The single most important number is **guests who scanned but never took a photograph.** That is your product failing, and it will be higher than you expect
- [ ] Read every support ticket yourself
- [ ] Follow up with every paying host personally
- [ ] Track storage cost per event against revenue per event
- [ ] Decide, on evidence, whether face lookup is actually wanted before building it

---

## Considered and deferred

A record of things that were asked for, examined, and consciously not built —
so the same ground is not re-argued in six months. Each one says what would
have to change for the answer to flip.

### Snapchat-style AR face filters

Real-time face tracking with dog ears, noses, tongues — the Snapchat lens
effect. **Deferred, not rejected**, and never in the guest camera as designed.

Three reasons, in order of how binding they are:

1. **Bundle.** The guest camera is ~17 KB against a hard 30 KB budget.
   MediaPipe's face-landmark runtime plus model is roughly 5–6 MB — about 200×
   the entire budget, downloaded in a cellar with one bar of reception. That is
   the exact scenario differentiator #3 exists for, so this is not a matter of
   tuning.
2. **Positioning.** `DESIGN.md` §3 says *not Instagram*, and the product sells
   "a cohesive aesthetic… rather than looking like a random cloud-upload
   folder". Dog ears are the incoherence the film treatment exists to prevent.
3. **Effort.** 2–4 weeks for a rough version; Snapchat quality — tongue
   physics, occlusion, multiple faces — is a licensed SDK (DeepAR, Banuba,
   Snap Camera Kit), not something to rebuild. Licence fees, and +20–40 MB.

There is also a smaller wrinkle: face tracking is face processing. On-device
and storing nothing, so far less fraught than the lookup feature — but it
complicates a pitch that says *we do not do surveillance*.

**What would flip it:** hosts asking for it unprompted during validation
(§0), or a competitor winning deals on it. In that case the shape is a
licensed SDK in the **native host app only**, sold as a separate opt-in
"photo booth" mode — never layered onto the disposable camera, so the guest
bundle stays small and the album stays coherent.

**Build this instead, and much sooner:**

- [ ] Frames and borders — white film border, event date, couple's names, a
      venue stamp. Canvas only, no detection, near-zero bytes, and it
      *reinforces* the one-roll idea rather than fighting it
- [ ] Draggable props a guest positions by finger — a moustache, a heart. No
      face detection at all; a few KB
- [ ] The film treatments already specced (Golden, Tungsten, Safelight)

Roughly 80% of the playfulness for about 1% of the cost, on-brand, and inside
the budget.

---

## Kill criteria

Written down in advance, because they are much harder to admit later.

- iOS Safari capture cannot be made reliable across the device matrix
- Guest join-to-first-photo conversion stays below 60% after two rounds of fixes
- Hosts consistently refuse to pay above the free tier
- Legal review concludes the guest-photography model cannot be made compliant at acceptable cost
