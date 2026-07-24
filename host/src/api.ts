import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Where the API lives.
 *
 * On a real phone, "127.0.0.1" means the phone itself and "10.0.2.2" is an
 * Android *emulator* alias — both are dead ends. What actually works is the
 * LAN address of the development machine, which Expo already knows because
 * the device just loaded the bundle from it.
 *
 * So: derive the host from Expo's own dev-server URI and swap the port. That
 * keeps working when the router hands out a new address, with nothing to
 * configure. EXPO_PUBLIC_API_BASE_URL still overrides it when needed.
 */
const API_PORT = 8000;

function inferDevBase(): string {
  // e.g. "192.168.188.21:8081" — the machine serving this bundle.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;

  const host = hostUri?.split(":")[0];
  if (host) return `http://${host}:${API_PORT}`;

  // Web dev, or a build with no dev server attached.
  return Platform.OS === "web"
    ? `http://127.0.0.1:${API_PORT}`
    : `http://localhost:${API_PORT}`;
}

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? inferDevBase();

export interface User {
  id: string;
  email: string;
  display_name: string;
}

export interface RequestCodeResult {
  sent: boolean;
  resend_available_in: number;
}

export interface VerifyResult {
  token: string;
  user: User;
  created: boolean;
}

/** Thrown for any non-2xx. `retryAfter` is populated for 429. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter?: number,
    /** Stable identifier for a refusal, so the client picks the wording. */
    readonly code?: string,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = "Something went wrong.";
    let retryAfter: number | undefined;
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") {
        detail = data.detail;
        // The API returns the wait in the message so the client can show a
        // real countdown rather than "try again later".
        const match = detail.match(/(\d+)\s*second/);
        if (match) retryAfter = Number(match[1]);
      }
    } catch {
      // Body wasn't JSON — keep the generic message.
    }
    throw new ApiError(detail, response.status, retryAfter);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  requestCode: (email: string, language = "en") =>
    post<RequestCodeResult>("/auth/request-code", { email, language }),

  verifyCode: (email: string, code: string) =>
    post<VerifyResult>("/auth/verify-code", { email, code }),

  logout: (token: string) => post<void>("/auth/logout", {}, token),

  me: async (token: string): Promise<User> => {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new ApiError("Not signed in", response.status);
    return (await response.json()) as User;
  },
};

// --- Events ----------------------------------------------------------------

export type Theme = "noon" | "golden" | "tungsten" | "silver" | "safelight" | "polar";

export interface EventDraft {
  title: string;
  event_type: string;
  location: string;
  timezone_name: string;
  capture_starts_at: string | null;
  capture_ends_at: string | null;
  reveals_at: string | null;
  theme: Theme;
  highlight_reel_enabled: boolean;
  guest_capacity: number;
  shots_per_guest: number;
  visibility_mode: "immediate" | "own_only" | "host_only" | "hidden";
  capture_mode: "camera_only" | "camera_and_upload" | "upload_only";
  guest_downloads_enabled: boolean;
  involves_minors: boolean;
  face_lookup_enabled: boolean;
  blur_child_faces: boolean;
}

export interface LumaEvent extends EventDraft {
  id: string;
  status: string;
  join_code: string;
  public_slug: string;
  join_url: string;
  revealed_at: string | null;
  reveal_withheld: boolean;
  is_capture_open: boolean;
  is_revealed: boolean;
  participant_count: number;
  photo_count: number;
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...rest } = init;
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
  });

  if (!response.ok) {
    let detail = "Something went wrong.";
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") detail = data.detail;
      // Django Ninja returns a list of pydantic errors for 422; surface the
      // first message rather than a generic failure.
      else if (Array.isArray(data?.detail) && data.detail[0]?.msg) {
        detail = String(data.detail[0].msg).replace(/^Value error,\s*/, "");
      }
    } catch {
      /* not JSON */
    }
    throw new ApiError(detail, response.status);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const events = {
  list: (token: string) => request<LumaEvent[]>("/events", { token }),

  create: (token: string, draft: EventDraft) =>
    request<LumaEvent>("/events", {
      method: "POST",
      body: JSON.stringify(draft),
      token,
    }),

  update: (token: string, id: string, draft: EventDraft) =>
    request<LumaEvent>(`/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify(draft),
      token,
    }),

  reveal: (token: string, id: string, reveal = true) =>
    request<LumaEvent>(`/events/${id}/reveal`, {
      method: "POST",
      body: JSON.stringify({ reveal }),
      token,
    }),

  publish: (token: string, id: string, publish = true) =>
    request<LumaEvent>(`/events/${id}/publish`, {
      method: "POST",
      body: JSON.stringify({ publish }),
      token,
    }),
};
