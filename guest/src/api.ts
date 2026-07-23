/**
 * Minimal API client. Hand-written for now; once the endpoint surface settles
 * this gets generated from /api/openapi.json (CHECKLIST.md §4).
 */

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface EventPublic {
  title: string;
  event_type: string;
  join_code: string;
  shots_per_guest: number;
  capture_mode: "camera_only" | "camera_and_upload" | "upload_only";
  theme: string;
  is_capture_open: boolean;
  is_revealed: boolean;
  face_lookup_enabled: boolean;
  capture_starts_at: string | null;
  capture_ends_at: string | null;
  reveals_at: string | null;
  timezone_name: string;
}

export interface Participant {
  id: string;
  display_name: string;
  shot_limit: number;
  shots_committed: number;
  shots_remaining: number;
  event_title: string;
  event_theme: string;
  capture_mode: string;
  is_capture_open: boolean;
  is_revealed: boolean;
  reveals_at: string | null;
}

export interface Reservation {
  media_id: string;
  upload_url: string;
  storage_key: string;
  shots_remaining: number;
  expires_in: number;
}

export interface Photo {
  id: string;
  url: string;
  created_at: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const response = await fetch(`${BASE}/api${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
  });

  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      /* not JSON */
    }
    throw new ApiError(detail, response.status);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  eventByCode: (code: string) =>
    call<EventPublic>(`/events/by-code/${encodeURIComponent(code)}`),

  join: (code: string, displayName: string, consentVersion: string) =>
    call<{ token: string; created: boolean; participant: Participant }>(
      `/guest/join/${encodeURIComponent(code)}`,
      {
        method: "POST",
        body: JSON.stringify({ display_name: displayName, consent_version: consentVersion }),
      },
    ),

  me: (token: string) => call<Participant>("/guest/me", { token }),

  reserve: (token: string, contentType = "image/jpeg") =>
    call<Reservation>("/guest/shots/reserve", {
      method: "POST",
      body: JSON.stringify({ content_type: contentType }),
      token,
    }),

  confirm: (token: string, mediaId: string, byteSize: number) =>
    call<{ media_id: string; shots_committed: number; shots_remaining: number }>(
      `/guest/shots/${mediaId}/confirm`,
      { method: "POST", body: JSON.stringify({ byte_size: byteSize }), token },
    ),

  photos: (token: string) => call<Photo[]>("/guest/photos", { token }),

  deletePhoto: (token: string, photoId: string) =>
    call<void>(`/guest/photos/${photoId}`, { method: "DELETE", token }),

  abandon: (token: string, mediaId: string) =>
    call<void>(`/guest/shots/${mediaId}/abandon`, { method: "POST", body: "{}", token }),
};

/** Upload straight to object storage. Never through the API. */
export async function putToStorage(url: string, blob: Blob): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": blob.type || "image/jpeg" },
  });
  if (!response.ok) throw new ApiError("upload failed", response.status);
}
