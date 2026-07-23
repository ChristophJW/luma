import { useEffect, useState } from "preact/hooks";

import { ApiError, api, type EventPublic } from "./api";

/** Read the join code from ?code= or from a /join/CODE path. */
function readJoinCode(): string | null {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("code");
  if (fromQuery) return fromQuery.toUpperCase();

  const match = window.location.pathname.match(/\/join\/([A-Za-z0-9]+)/);
  return match ? match[1].toUpperCase() : null;
}

type State =
  | { kind: "loading" }
  | { kind: "no-code" }
  | { kind: "not-found" }
  | { kind: "offline" }
  | { kind: "ready"; event: EventPublic };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const code = readJoinCode();
    if (!code) {
      setState({ kind: "no-code" });
      return;
    }

    api
      .eventByCode(code)
      .then((event) => setState({ kind: "ready", event }))
      .catch((error: unknown) => {
        // Errors on the guest side never blame and never expose codes.
        // DESIGN.md §10.
        if (error instanceof ApiError && error.status === 404) {
          setState({ kind: "not-found" });
        } else {
          setState({ kind: "offline" });
        }
      });
  }, []);

  switch (state.kind) {
    case "loading":
      return <Screen>{null}</Screen>;

    case "no-code":
      return (
        <Screen>
          <p class="eyebrow">Luma</p>
          <p class="body">Scan the QR code at your event to join.</p>
          <p class="body muted">
            Development: try <code>?code=LUMA01</code>
          </p>
        </Screen>
      );

    case "not-found":
      return (
        <Screen>
          <p class="event-title">This event isn't here</p>
          <p class="body muted">
            The code may have changed. Ask your host for a fresh QR code.
          </p>
        </Screen>
      );

    case "offline":
      return (
        <Screen>
          <p class="event-title">Can't reach Luma</p>
          <p class="body muted">
            Your connection dropped. Nothing is lost — try again in a moment.
          </p>
          <button class="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </Screen>
      );

    case "ready":
      return <Cover event={state.event} />;
  }
}

/** The cover screen a guest sees immediately after scanning. */
function Cover({ event }: { event: EventPublic }) {
  return (
    <Screen>
      <p class="eyebrow">You're invited to</p>
      <h1 class="event-title">{event.title}</h1>

      <div>
        <p class="counter">{event.shots_per_guest}</p>
        <p class="counter-label">shots to spend</p>
      </div>

      {event.is_capture_open ? (
        <>
          <p class="body muted">
            Take them when they matter. You can't take more.
          </p>
          {/* Next: name entry → consent → camera permission → viewfinder. */}
          <button class="button" disabled>
            Start — not built yet
          </button>
        </>
      ) : (
        <p class="body muted">This event isn't open for photos right now.</p>
      )}
    </Screen>
  );
}

function Screen({ children }: { children: preact.ComponentChildren }) {
  return (
    <main class="screen">
      <HealthPill />
      {children}
    </main>
  );
}

/** Development-only connectivity indicator. Remove before launch. */
function HealthPill() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .health()
      .then((h) => setOk(h.status === "ok"))
      .catch(() => setOk(false));
  }, []);

  if (!import.meta.env.DEV) return null;

  const className = ok === null ? "status" : ok ? "status is-ok" : "status is-down";
  return <div class={className}>{ok === null ? "…" : ok ? "api ok" : "api down"}</div>;
}
