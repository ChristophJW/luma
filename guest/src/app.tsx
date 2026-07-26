import { useCallback, useEffect, useState } from "preact/hooks";

import { ApiError, type EventPublic, type Participant, api } from "./api";
import { Camera } from "./Camera";
import { Gallery } from "./Gallery";
import { Logo } from "./Logo";
import { locale, t } from "./i18n";
import { onQueueChange, startDraining } from "./uploader";

const CONSENT_VERSION = "2026-07-01";
const TOKEN_KEY = "luma.camera.token";

/** Read the join code from /join/CODE or ?code=CODE. */
/**
 * Explain a closed door instead of just refusing at it.
 *
 * A guest who scans the code an hour early should be told when the cameras
 * open, not handed a flat "not open right now" that reads like a bug.
 */
function closedReason(event: EventPublic): string {
  const now = Date.now();
  const starts = event.capture_starts_at ? new Date(event.capture_starts_at) : null;
  const ends = event.capture_ends_at ? new Date(event.capture_ends_at) : null;

  if (ends && now > ends.getTime()) return t("cover.ended");

  if (starts && now < starts.getTime()) {
    const zone = event.timezone_name || undefined;
    const sameDay =
      new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone: zone }).format(starts) ===
      new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone: zone }).format(new Date());

    if (sameDay) {
      return t("cover.notYetToday", {
        time: new Intl.DateTimeFormat(locale, {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: zone,
        }).format(starts),
      });
    }
    return t("cover.notYet", {
      when: new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: zone,
      }).format(starts),
    });
  }

  return t("cover.closed");
}

function readJoinCode(): string | null {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("code");
  if (fromQuery) return fromQuery.toUpperCase();

  const match = window.location.pathname.match(/\/join\/([A-Za-z0-9]+)/);
  return match ? match[1].toUpperCase() : null;
}

/** Some in-app browsers simply do not expose a camera. Detect the capability
 *  rather than sniffing user agents, which go stale. CHECKLIST.md §0. */
const cameraSupported = Boolean(navigator.mediaDevices?.getUserMedia);

type Screen =
  | { kind: "loading" }
  | { kind: "no-code" }
  | { kind: "error"; message: string }
  | { kind: "cover"; event: EventPublic }
  | { kind: "join"; event: EventPublic }
  | { kind: "no-camera" }
  | { kind: "permission"; participant: Participant }
  | { kind: "denied"; participant: Participant }
  | { kind: "camera"; participant: Participant }
  | { kind: "roll"; participant: Participant };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [taken, setTaken] = useState(0);
  const [pending, setPending] = useState(0);
  const [name, setName] = useState("");
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gallery, setGallery] = useState(false);

  // Resume an existing participation before anything else, so a guest coming
  // back to the tab is not asked for their name twice.
  useEffect(() => {
    const code = readJoinCode();
    if (!code) {
      setScreen({ kind: "no-code" });
      return;
    }

    (async () => {
      if (token) {
        try {
          const participant = await api.me(token);
          setTaken(participant.shots_committed);
          setScreen(
            participant.shots_remaining <= 0
              ? { kind: "roll", participant }
              : { kind: "permission", participant },
          );
          return;
        } catch {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        }
      }

      try {
        setScreen({ kind: "cover", event: await api.eventByCode(code) });
      } catch (error) {
        setScreen({
          kind: "error",
          message:
            error instanceof ApiError && error.status === 404
              ? t("error.notFound")
              : t("error.offline"),
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (!token) return;
    const stopWatching = onQueueChange(({ pending: count }) => setPending(count));
    const stopDraining = startDraining(token);
    return () => {
      stopWatching();
      stopDraining();
    };
  }, [token]);

  const join = useCallback(
    async (event: EventPublic) => {
      setBusy(true);
      try {
        const result = await api.join(event.join_code, name.trim(), CONSENT_VERSION);
        localStorage.setItem(TOKEN_KEY, result.token);
        setToken(result.token);
        setTaken(result.participant.shots_committed);
        setScreen({ kind: "permission", participant: result.participant });
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 0;
        // 409 covers several refusals — full, closed, not started. The server
        // names which with a stable code; the wording comes from here so it
        // is in the guest's language.
        const code = error instanceof ApiError ? error.code : undefined;
        setScreen({
          kind: "error",
          message: code
            ? t(`refused.${code}` as "refused.event_closed")
            : status === 0
              ? t("error.offline")
              : t("error.generic"),
        });
      } finally {
        setBusy(false);
      }
    },
    [name],
  );

  async function requestCamera(participant: Participant) {
    try {
      // Ask, then immediately release — the Camera component opens its own
      // stream with the settings it wants.
      const probe = await navigator.mediaDevices.getUserMedia({ video: true });
      probe.getTracks().forEach((track) => track.stop());
      setScreen({ kind: "camera", participant });
    } catch {
      setScreen({ kind: "denied", participant });
    }
  }

  switch (screen.kind) {
    case "loading":
      return <Screen />;

    case "no-code":
      return (
        <Screen brand centred>
          <p class="body muted">Scan the QR code at your event to join.</p>
        </Screen>
      );

    case "error":
      return (
        <Screen
          centred
          action={
            <button class="button" onClick={() => window.location.reload()}>
              {t("permission.retry")}
            </button>
          }
        >
          <p class="body">{screen.message}</p>
        </Screen>
      );

    case "cover": {
      const { event } = screen;
      return (
        <Screen
          brand
          eyebrow={t("cover.invitedTo")}
          title={event.title}
          centred
          action={
            event.is_capture_open ? (
              <button class="button" onClick={() => setScreen({ kind: "join", event })}>
                {t("cover.start")}
              </button>
            ) : null
          }
        >
          <div class="allowance">
            <span class="counter">{event.shots_per_guest}</span>
            <span class="counter-label">{t("cover.shotsToSpend")}</span>
          </div>
          <p class="body muted">
            {event.is_capture_open ? t("cover.scarcity") : closedReason(event)}
          </p>
        </Screen>
      );
    }

    case "join": {
      const { event } = screen;
      return (
        <Screen
          eyebrow={event.title}
          title={t("join.nameLabel")}
          action={
            <button
              class="button"
              disabled={!name.trim() || !consented || busy}
              onClick={() =>
                cameraSupported ? void join(event) : setScreen({ kind: "no-camera" })
              }
            >
              {t("join.continue")}
            </button>
          }
        >
          <label class="field">
            <input
              class="input"
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              placeholder={t("join.namePlaceholder")}
              autoComplete="given-name"
              enterkeyhint="go"
              autoFocus
            />
          </label>

          <label class="consent">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented((e.target as HTMLInputElement).checked)}
            />
            <span class="body">{t("join.consent")}</span>
          </label>
        </Screen>
      );
    }

    case "no-camera":
      return (
        <Screen
          title={t("browser.heading")}
          action={
            <button
              class="button"
              onClick={() => void navigator.clipboard?.writeText(window.location.href)}
            >
              {t("browser.copy")}
            </button>
          }
        >
          <p class="body muted">{t("browser.body")}</p>
        </Screen>
      );

    case "permission":
      return (
        <Screen
          title={t("permission.heading")}
          action={
            <button class="button" onClick={() => void requestCamera(screen.participant)}>
              {t("permission.allow")}
            </button>
          }
        >
          <p class="body muted">{t("permission.body")}</p>
        </Screen>
      );

    case "denied":
      return (
        <Screen
          title={t("permission.deniedHeading")}
          action={
            <button class="button" onClick={() => void requestCamera(screen.participant)}>
              {t("permission.retry")}
            </button>
          }
        >
          <p class="body muted">{t("permission.deniedBody")}</p>
        </Screen>
      );

    case "camera": {
      const { participant } = screen;
      const total = participant.shot_limit;

      if (gallery) {
        return (
          <Gallery
            token={token!}
            title={participant.event_title}
            onClose={() => setGallery(false)}
          />
        );
      }

      if (taken >= total) {
        return <Roll total={total} pending={pending} onOpenGallery={() => setGallery(true)} />;
      }

      return (
        <Camera
          token={token!}
          taken={taken}
          total={total}
          pending={pending}
          onCaptured={() => setTaken((count) => count + 1)}
          onOpenGallery={() => setGallery(true)}
        />
      );
    }

    case "roll":
      return gallery ? (
        <Gallery
          token={token!}
          title={screen.participant.event_title}
          onClose={() => setGallery(false)}
        />
      ) : (
        <Roll
          total={screen.participant.shot_limit}
          pending={pending}
          onOpenGallery={() => setGallery(true)}
        />
      );
  }
}

function Roll({
  total,
  pending,
  onOpenGallery,
}: {
  total: number;
  pending: number;
  onOpenGallery: () => void;
}) {
  return (
    <Screen
      title={t("roll.heading")}
      centred
      action={
        <button class="button button-quiet" onClick={onOpenGallery}>
          {t("gallery.open")}
        </button>
      }
    >
      <div class="allowance">
        <span class="counter">{total}</span>
        <span class="counter-label">{t("waiting.captured", { taken: total, total })}</span>
      </div>
      <p class="body">{t("waiting.developing")}</p>
      {pending > 0 ? <p class="body muted">{t("camera.queued", { count: pending })}</p> : null}
    </Screen>
  );
}

/**
 * Every non-camera screen shares one structure: content centred vertically in
 * the middle, the primary action pinned in the thumb zone. Hero screens are
 * centred; anything to read or fill in stays left aligned, because centred
 * body text is harder to scan.
 */
function Screen({
  eyebrow,
  brand,
  title,
  centred,
  children,
  action,
}: {
  eyebrow?: string;
  /** Show the Luma lockup in place of a text eyebrow — for entry screens. */
  brand?: boolean;
  title?: string;
  centred?: boolean;
  children?: preact.ComponentChildren;
  action?: preact.ComponentChildren;
}) {
  return (
    <main class="screen">
      <div class={centred ? "screen-body is-centred" : "screen-body"}>
        {brand ? <Logo height={30} /> : null}
        {eyebrow ? <p class="eyebrow">{eyebrow}</p> : null}
        {title ? <h1 class="display">{title}</h1> : null}
        {children}
      </div>
      {action ? <div class="screen-footer">{action}</div> : null}
    </main>
  );
}
