# Luma — Design Guide

Instructions for designing Luma's interfaces. Hand this to a designer, human or otherwise, together with `CONCEPT.md`.

Read the **Non-negotiables** and **Anti-brief** sections before drawing anything. Everything else is guidance; those two are constraints.

---

## 1. What Luma is

A premium private camera experience for weddings and events. Guests join by scanning a QR code, capture a limited number of photographs, and discover the complete album together after the event.

The name means *light* — luminance, the thing that makes a photograph.

### The feeling

The emotional core of this product is **anticipation**, not sharing. A guest takes twelve photographs and then has to wait. The design's job is to make that wait feel deliberate and warm rather than broken.

The reference is a disposable camera at a wedding in 1998: mechanical, finite, slightly mysterious, and worth the wait to see what came out. Not the camera's cheapness — its *patience*.

Three words to design against: **warm, finite, unhurried.**

### Three surfaces, three jobs

| Surface | Context | Job |
| --- | --- | --- |
| **Guest camera** | dim venue, one hand, loud room, held at arm's length, user has been drinking | Get out of the way. Capture and count. |
| **Host app** | laptop or phone, weeks before, planning mode, sober and careful | Feel calm and trustworthy. Nothing irreversible by accident. |
| **Marketing** | daylight, browsing, comparing against Once | Sell anticipation. Show photographs, not features. |

These do **not** share a layout system. They share colour, type and voice. Do not make the camera look like the host app.

---

## 2. Non-negotiables

Break these and the design has failed regardless of how it looks.

1. **The guest never sees a login before or during capture.** No account, no password, no app store, no "continue with" buttons between scanning the QR code and taking a photograph. Name field, consent, camera. An account is offered *after* the reveal, as an upgrade — never as a gate. See §12.
2. **The shot counter is always visible while capturing.** It is the product's core mechanic. It is never hidden behind a menu, never collapsed, never fades out.
3. **Nothing on the capture screen loads from a third party.** No font CDN, no analytics, no icon library over the network. Every asset is in the bundle — 30 KB gzipped, enforced as a build failure — or inlined. Design accordingly: system fonts are acceptable on the camera screen if the brand face won't fit.
4. **Text never sits directly on live video.** Always a scrim, a solid pill, or a blurred plate. A viewfinder pointed at a white tablecloth will erase unprotected white text.
5. **Every interactive target is at least 44 × 44 pt.** In a dark room, on the move.
6. **Face lookup is never pre-ticked, never opt-out, never nudged.** Decline is visually equal to accept. See §9.
7. **German and English from day one.** German UI strings run 30–40% longer than English. Any layout that breaks on `Fotoveröffentlichungseinstellungen` is a broken layout, not a long word.
8. **The reveal must have a reduced-motion path** that still feels like an event.

---

## 3. Anti-brief — what Luma is not

State these to any generative tool explicitly; they are the defaults it will otherwise reach for.

**Not Instagram.** No purple-to-orange gradients, no story rings, no neon, no glassmorphism, no floating action button with a plus icon.

**Not enterprise SaaS.** No `#3B82F6` primary, no 8px-radius card grid, no dashboard-first information architecture, no sidebar with fourteen icons.

**Not wedding kitsch.** No script or calligraphic fonts, no gold foil textures, no eucalyptus watercolour, no rings-and-doves iconography, no blush-and-sage palette, no "Mr & Mrs" set in Great Vibes.

**Not an AI product.** No sparkle icons, no gradient-outlined "magic" buttons, no shimmer-on-generate. Face lookup in particular must look like a utility, not a wizard.

**Not skeuomorphic.** The disposable-camera reference is an *emotional* reference, not a visual one. No plastic textures, no fake film-strip borders around UI, no simulated viewfinder crosshairs, no chunky 90s bevels. The analog feeling comes from colour temperature, pacing and restraint.

---

## 4. Colour

Warm-cast throughout. Every neutral leans toward amber; there is no blue-black and no cool grey anywhere in the system. This single decision carries most of the brand.

### Ink — warm dark scale

```
--ink-900  #14110F   camera background, deepest surface
--ink-800  #1E1A17   raised surface on dark
--ink-700  #2B2521   borders on dark, inactive chrome
--ink-600  #3D352F   disabled text on dark
--ink-500  #5A4F47   secondary text on dark
```

### Paper — warm light scale

```
--paper-000  #FFFDFA   host app background
--paper-100  #F7F3ED   primary text on dark, raised surface on light
--paper-200  #EDE7DE   borders on light, inactive fill
--paper-300  #DDD4C8   dividers, skeleton fill
```

### Glow — the accent, and the brand

Amber. Tungsten light, safelight, the last hour of sun. Used for the counter, the reveal, and progress toward it. **Not** used for every button.

```
--glow-400  #F2B45C   accent on dark surfaces
--glow-500  #E09538   accent, mid — fills and icons only
--glow-600  #C47621   accent on light — large text and UI only
--glow-700  #8A4E12   accent text on light backgrounds
```

### Safelight — record and destroy

Darkroom red. Two uses only: active capture state, and destructive confirmation. Never decorative.

```
--safelight  #C2413A
```

### Verified contrast

Computed against the stated hexes. **Re-verify if you change any value.**

| Pair | Ratio | Approved for |
| --- | ---: | --- |
| `paper-100` on `ink-900` | 17.0 : 1 | everything, including 12px |
| `ink-900` on `paper-000` | 17.0 : 1 | everything |
| `glow-400` on `ink-900` | 10.3 : 1 | everything — this is the counter colour |
| `glow-700` on `paper-000` | 6.5 : 1 | body text on light |
| `glow-600` on `paper-000` | 3.5 : 1 | **large text ≥ 24px and UI only** — never body copy |
| `safelight` on `ink-900` | 3.7 : 1 | **large text and non-text UI only** — never body copy |

Target AA throughout. The shot counter and the remaining-shots number target AAA — a guest reads them at arm's length in a dark room.

### Rules

- Never use colour alone to convey shot state. Low shots remaining changes the *number's* colour **and** its weight **and** the label text.
- The camera screen is dark. Always. There is no light mode for the viewfinder — it destroys night vision and blows out the preview.
- The host app defaults to light and supports dark. The marketing site is light.
- Photographs are the only saturated things on screen. Chrome recedes.

---

## 5. Typography

Two families. No more.

**Display — Fraunces (variable).** Warm, crafted, has optical-size and softness axes. Used for event names, reveal moments, marketing headlines. Set `SOFT` low and `WONK` off for UI; let it soften only on the marketing site.

**UI — Inter (variable).** Neutral, exhaustive language coverage, excellent at small sizes. Everything else.

**On the camera screen**, if Fraunces will not fit the bundle budget, drop it. Inter alone, or the system stack, is correct there. Brand consistency loses to load time on that screen — see Non-negotiable #3.

### Scale

```
display-xl   48 / 52   Fraunces 400   reveal, marketing hero
display-l    32 / 38   Fraunces 400   event name, section openers
display-m    24 / 30   Fraunces 400   card titles on host
body-l       18 / 26   Inter 400      guest-facing prose
body         16 / 24   Inter 400      default
body-s       14 / 20   Inter 400      host secondary — never on the camera
label        13 / 16   Inter 500      form labels, uppercase tracking +0.06em
counter      40 / 40   Inter 600      tabular figures, tracking +0.02em
```

Nothing below 15px appears anywhere in the guest flow.

### The counter

The frame counter is the product's signature typographic element. Treat it as such.

- **Tabular lining figures, always.** `font-variant-numeric: tabular-nums`. A counter that reflows as it counts down looks broken.
- Set the number in `--glow-400`, the label in `--paper-100` at `label` size.
- It reads `12 of 20`, not `12/20` and not `8 left`. The total matters — finiteness is the point.
- At three or fewer remaining, the number shifts to `--safelight` and the label changes to `3 shots left`. Colour and text both.

---

## 6. Layout, spacing, motion

### Spacing

4px base. Use `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`.

Radius: `8` for controls, `12` for cards, `999` for pills and the shutter. Photographs get radius `4` on host and marketing, and `0` in the album grid — a photograph's own edge is the frame.

### Motion

Camera mechanisms are damped. Nothing in Luma bounces.

```
micro        120ms   ease-out       hover, press, toggle
transition   240ms   ease-out       screen and sheet enters
considered   400ms   ease-in-out    state changes the user should notice
reveal       see §8  bespoke        the album opening
shutter       80ms   linear         the one fast thing in the system
```

No spring overshoot anywhere except the shutter's press. No parallax. No auto-playing carousels. No skeleton shimmer — use a static `paper-300` block; shimmer reads as urgency and this product is not urgent.

Every animation respects `prefers-reduced-motion`. That means an alternate path, not a disabled one.

---

## 7. The guest camera

The hardest screen in the product, and the one worth the most design time.

### Constraints, stated plainly

The user is standing in a dim room, holding a phone in one hand and a drink in the other, surrounded by noise, possibly a little drunk, and does not want to be using software. They will not read anything longer than four words. They may be on a phone from 2019 with 4% battery.

### Layout

```
┌─────────────────────────────┐
│  ▓▓▓ scrim ▓▓▓              │  top scrim, ink-900 → transparent
│    12 of 20                 │  counter, always visible
│                             │
│                             │
│      live viewfinder        │  full bleed, edge to edge
│                             │
│                             │
│                             │
│  ▓▓▓ scrim ▓▓▓              │  bottom scrim
│   [flip]   ( ● )   [flash]  │  thumb zone — bottom 25%
└─────────────────────────────┘
```

- **Full-bleed viewfinder.** Chrome floats over it. No letterboxing, no framed preview inside a card.
- **Everything interactive lives in the bottom 25%.** Nothing the user must tap sits above the vertical midpoint.
- **Shutter: 80px circle, centred.** `paper-100` fill, `ink-900` at 20% ring. On press it contracts to 72px over 80ms and the whole screen flashes `paper-100` at 15% for one frame.
- **Scrims are mandatory**, top and bottom: a linear gradient from `ink-900` at 70% to transparent, 96px tall. This is what makes the counter survive a white tablecloth.
- **Landscape is supported.** Controls move to the right edge; the counter stays top-left. Do not rotate the icons only and call it done.
- Respect the notch and home indicator. The shutter never sits under the gesture bar.

### Feedback

A wedding is loud and dark. Every capture confirms three ways: the shutter flash, a haptic tap, and the counter decrementing with a 120ms weight shift. Sound is opt-in and off by default — nobody wants a shutter click during vows.

### States to design

- **Permission not yet granted** — a warm explanatory screen, not a browser dialog appearing over a black void. Explain in one sentence why the camera is needed, then trigger the prompt on an explicit tap.
- **Permission denied** — recoverable. Show the actual steps for that browser. This is a real and frequent dead end.
- **Uploading in background** — a thin `glow-500` progress line under the top scrim. Never a blocking spinner. The guest keeps shooting.
- **Offline, queued** — `3 photos waiting` in the top scrim, calm, not alarming. This is normal at a venue and must not read as an error.
- **Last shot taken** — the moment the counter hits zero deserves a designed beat. A brief full-screen `That's the roll.` then the waiting state.
- **Out of shots** — the shutter is gone, not disabled-and-greyed. Replaced by the waiting state.
- **Capture window closed** — event ended while they were shooting.

### The waiting state

The screen a guest sees between their last shot and the reveal. Currently the weakest-specified part of the concept and the biggest opportunity.

```
        12 of 20 moments captured

        Your photos are developing.
        The album opens Sunday at 12:00.

              [ countdown ]
```

Set the count in `display-l`, the body in `body-l`, the countdown in tabular figures. The background is `ink-900` with a very slow `glow-500` gradient drift — a 20-second cycle, barely perceptible, like a safelight. This is the one place a slow ambient animation is right.

Do not use a progress bar. Nothing is progressing; something is developing.

---

## 8. The reveal

The product's payoff. Design it as a moment with a beginning and an end, not as a gallery becoming clickable.

```
countdown reaches zero
  → "Your memories are ready"        display-xl, 600ms fade up
  → light bloom                       glow-400 wash, 800ms, blooms and clears
  → first photograph resolves         from ink-900, 400ms
  → highlight reel, 6–8 frames        1.2s each, ken-burns off, cross-fade
  → grid settles into place           staggered 40ms per tile
  → album, fully interactive
```

Total: roughly 8 seconds. **Skippable at any point** with a persistent, visible control — never a hidden tap-anywhere. A guest opening the album for the fourth time sees the grid immediately; the sequence plays once per device.

**Reduced-motion path:** no bloom, no ken-burns, no stagger. The headline appears, holds for 1.5s, and the grid cross-fades in over 400ms. It still feels like an opening.

### Album

- Photographs at radius `0` in the grid, edge to edge, 2px gutters. The wall of images is the point.
- Attribution is present but quiet — `label` size, `ink-500`, below the frame, not overlaid.
- Reactions are small and warm. No animated bursts, no floating hearts.
- The download control is prominent. People came for the photographs.

---

## 9. Face lookup — consent UI

This screen carries legal weight. Article 9 GDPR biometric consent must be freely given, specific, informed and unambiguous, and the interface is part of whether it is.

**Design rules, all of them mandatory:**

- Decline and accept have **identical visual weight**. Same size, same contrast, same prominence. No ghost-button decline against a filled accept.
- No pre-ticked anything, ever.
- Plain language on the screen itself. Not a link to the privacy policy. Something a guest can read in fifteen seconds and actually understand: what is computed, where it runs, how long it is kept, and how to undo it.
- State the deletion promise **on the consent screen**, not in a tooltip: the selfie is never stored, and the face data is deleted the moment the search finishes.
- No sparkle, no gradient, no "AI" framing. This is a search function, not magic.
- Withdrawal is as easy as consent — one tap, from the album, always available, never buried in settings.
- The result screen shows matches for **review**, with wrong matches easy to reject. Never present the result as certain.

If the design makes accepting feel easier than declining, it is not valid consent and the feature cannot ship.

---

## 10. Voice

Warm, spare, human. Short sentences. No exclamation marks. No emoji in product copy. Never cute.

| Write | Not |
| --- | --- |
| Your photos are developing. | Woohoo! Your pics are cooking 📸 |
| That's the roll. | Oops, you're out of shots! |
| 3 shots left | Only 3 left!! |
| The album opens Sunday at 12:00. | Get ready for the big reveal!!! |
| We found you in 34 photographs. | ✨ AI found your face! |
| Couldn't reach the server. Your photos are safe and will upload automatically. | Upload failed. Error 503. |

Errors on the guest side never blame, never expose codes, and always say what happens next. A guest whose upload failed has done nothing wrong and can do nothing about it.

German copy is written, not translated. `Deine Fotos entwickeln sich.` — informal `du` throughout; this is a wedding, not a bank.

---

## 11. Host app

Expo / React Native for Web across iOS, Android and browser. Design once, for touch.

- **No hover-dependent interaction.** Anything revealed on hover must also be reachable by tap. This eliminates hover-only action menus on table rows.
- **Comfortable density.** This is not a data tool. A host creates two events in their life.
- **Light by default**, dark supported. People plan weddings on laptops in daylight.
- **Event creation is a wizard, not a settings page.** Name and date, then look, then guests and shots, then the reveal, then privacy. **One decision per screen on every width** — a single centred column at phone width, with the header and the Continue button fixed and only the step's own content able to scroll. Widening it into a grouped desktop form turns the sequence back into exactly what it is trying not to be.
- **A wizard step asks only what cannot be sensibly defaulted.** Capture mode and album visibility keep their recommended values and live in event settings afterwards. Anything you add to a step is something a host must decide before they can continue, so the bar is high.
- **Destructive actions require typed confirmation**, not just a red button. Deleting an event destroys photographs that cannot be recovered.
- **The live counter during an event** is the host's favourite screen. Guests joined, photos captured, updating live. Give it real design attention — it is what they will screenshot.
- **Moderation** shows the photograph large, with removal one tap away and undo available for 30 seconds.

### Film themes

Presented as a strip of the *same* sample photograph rendered in each treatment — never as swatches or names alone. Names are evocative and generic, never trademarked film stock: `Noon`, `Golden`, `Tungsten`, `Silver`, `Safelight`, `Polar`.

The host's preview of a theme must match the guest's camera output exactly. Both read from the shared design-token package.

---

## 12. Account and sign-in screens

Covers `CONCEPT.md` §4. These screens are the only place in the product where a person is asked to do administrative work, so they are judged on one thing: how fast they get out of the way.

**The bar, stated in the concept and worth repeating here:** *if someone abandons sign-up, that is a bug in the flow, not a lack of motivation.*

### One entry point

There is no "Log in / Sign up" tab pair, and no choice to get wrong. The visitor types an email address; the system decides whether this is a returning host or a new one and moves to the code screen either way. Design a **single field**, not a fork.

### One account, and the URL picks the role

There is one account type. The same person hosts their own wedding and attends a friend's, with one login. **Never design a "continue as host / continue as guest" screen** — the entry point decides:

```text
luma.de/join/LUMA01   →  guest, capturing
luma.de/              →  host, my events
```

A signed-in person who scans a QR code joins in one tap with their name already filled — no sign-in, no retyping. A person with no account still captures anonymously; that path must not gain a login step (non-negotiable #1).

The two paths are served by different bundles for load-time reasons (`CONCEPT.md`, Frontend), but that seam must be invisible: same colours, same type, same voice, same session. If a guest can tell they crossed into "a different app", the design has failed.

### Two screens, one field each

```text
Screen 1        [ email                    ]   → Continue
Screen 2        [ _ _ _ _ _ _ ]                → verified, you're in
                Resend in 0:24
```

Nothing else on either screen. No name, no company, no phone, no password confirmation, no CAPTCHA on the happy path — rate limiting and short code expiry do that job invisibly.

### The code input

The most failure-prone control in the product. It must:

- accept **paste** of the whole code, including with surrounding whitespace
- carry `autocomplete="one-time-code"` so iOS and Android offer the code above the keyboard — this single attribute removes most of the friction
- raise the numeric keypad on mobile
- stay usable at **200% text size** and with a screen reader; six separate boxes often fail both, so a single field with spaced characters is the safer default
- never auto-submit on a partially-typed code
- survive the person switching to their mail app and coming back

### Failure states — design all four

Each states what happened and what to do next, with a resend that actually resends and a **visible cooldown**, never a silent one.

| State | Message shape |
| --- | --- |
| Code wrong | Say so, keep the digits, let them retry without retyping the email |
| Code expired | Offer a fresh one in the same tap, not a restart |
| Mail not arrived | Resend + check-spam hint + the address it went to, so a typo is visible |
| Too many attempts | A wait, with the time shown counting down — never a dead end |

### Sign-up comes after the work

A host configures an entire event and sees their theme preview before being asked for anything. The account is requested at save or at payment, and **everything configured survives it**. Design the sign-up as an interruption to be recovered from, not a front door — including a return path if they come back ten minutes later.

### The guest claim

Shown after the reveal, never before. One tap on "Keep these memories", one code, done — no password step at any point.

**Declining must cost nothing, and must look like it costs nothing.** A guest who says no keeps full album access for the event's retention period. Give decline the same visual weight as accept, the same rule as the consent screen in §9. This is an upgrade being offered, not a wall.

The claim link in the reveal email logs them in directly. It must never drop someone on a login form — arriving at a form after clicking a personal link reads as a bug.

### Passkeys

Offered **after** the first successful login, as an upgrade, and skippable without friction. Never an obstacle during sign-in. If social sign-in ever ships it stays visually secondary — it is a third-party request on a privacy-first product.

### Deletion

As easy as creation: reachable inside the web app in two taps, with no support email in the loop. Design it as a normal path, not a hidden one — but keep the typed-confirmation rule from §11, because a host deleting an account destroys photographs.

### German

The worst offender in the product. `Bestätigungscode erneut senden` and `Wir haben dir einen Code geschickt` are long, and the countdown sits next to them. Design these screens in German first; if they work there, English is free.

---

## 13. Handing this to Claude Design

Give it `CONCEPT.md` and this file, then request **one screen at a time**. Asking for a whole app produces averaged, generic output; asking for a single screen with real constraints produces something usable.

Include in every request: the surface, the ambient context, the state, and the anti-brief.

**Example — camera:**

> Design the Luma guest capture screen, per DESIGN.md §7. Dark surface `#14110F`, full-bleed viewfinder, top and bottom scrims. Counter top-left reading `12 of 20` in `#F2B45C`, tabular figures, 40px. Shutter 80px centred in the bottom 25%, flanked by camera-flip and flash. Portrait, iPhone with notch and home indicator. The user is in a dim wedding venue holding a drink. Not Instagram, no gradients, no glassmorphism, no floating action button.

**Example — waiting state:**

> Design the Luma post-capture waiting screen, per DESIGN.md §7. The guest has used all 20 shots and the album reveals in 14 hours. Convey patience and warmth, not loading. Background `#14110F` with a barely perceptible amber ambient drift. No progress bar — nothing is progressing, something is developing. Fraunces for the headline, Inter tabular for the countdown.

**Example — consent:**

> Design the Luma face-lookup consent screen, per DESIGN.md §9. GDPR Article 9 explicit consent. Decline and accept must have identical visual weight — this is a hard requirement, not a preference. Plain-language explanation on screen, covering what is computed, that it runs in the EU, that the selfie is never stored, and that face data is deleted when the search finishes. No sparkle icons, no gradients, no AI framing.

**Example — one-time code:**

> Design the Luma one-time code screen, per DESIGN.md §12. Second of two screens; the person has already entered their email. A single code field supporting paste and `autocomplete="one-time-code"`, a resend control with a visible countdown, and the address the code was sent to so a typo is spotted. Must hold at 200% text size and in German (`Bestätigungscode erneut senden`). No CAPTCHA, no password field, no logo lockup taking half the screen.

### Reviewing what comes back

Check in this order, and reject on any failure:

1. Is the counter legible over a white tablecloth?
2. Can everything be reached by one thumb?
3. Does any neutral read as cool or blue?
4. Would the German string still fit?
5. Does declining look as easy as accepting?
6. Does it look like a wedding app, an AI app, or a dashboard? All three are failures.
