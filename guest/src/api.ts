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
  is_capture_open: boolean;
  is_revealed: boolean;
  face_lookup_enabled: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new ApiError(`Request failed: ${path}`, response.status);
  }
  return (await response.json()) as T;
}

export const api = {
  health: () => get<{ status: string; database: boolean }>("/health"),
  eventByCode: (code: string) =>
    get<EventPublic>(`/events/by-code/${encodeURIComponent(code)}`),
};
