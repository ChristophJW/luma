/**
 * The capture endpoints, from the host app.
 *
 * Exactly the same contract the guest camera uses. A host photographing their
 * own event is a participant in it, so nothing here is host-specific beyond
 * how the camera session is obtained.
 */

import * as FileSystem from "expo-file-system/legacy";

import { API_BASE, ApiError } from "../api";

export interface CameraParticipant {
  id: string;
  display_name: string;
  shot_limit: number;
  shots_committed: number;
  shots_remaining: number;
  event_title: string;
  is_capture_open: boolean;
}

export interface Reservation {
  media_id: string;
  upload_url: string;
  shots_remaining: number;
}

export interface Photo {
  id: string;
  url: string;
  created_at: string;
}

// Fail fast instead of hanging: a request to an unreachable API (a stale dev
// IP, a phone that wandered off the network) would otherwise sit on the OS TCP
// timeout for a minute or more, which reads as "the gallery never loads".
const REQUEST_TIMEOUT_MS = 12_000;

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(rest.headers ?? {}),
      },
    });
  } catch (caught) {
    // Timeout or transport failure. Status 0 marks it as retryable to the
    // uploader and "offline" to the screens, rather than a real refusal.
    const aborted = caught instanceof Error && caught.name === "AbortError";
    throw new ApiError(aborted ? `Couldn't reach the server (${API_BASE}).` : "Network error.", 0);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = "";
    let code: string | undefined;
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") detail = data.detail;
      if (typeof data?.code === "string") code = data.code;
    } catch {
      /* not JSON */
    }
    throw new ApiError(detail, response.status, undefined, code);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const capture = {
  /**
   * Join the event.
   *
   * With an account token the participation is linked to the signed-in user,
   * so a host ends up with one identity rather than an anonymous second one.
   * Without it — a guest scanning the QR from the sign-in screen — the join is
   * anonymous, exactly as the guest web app does it.
   */
  join: (joinCode: string, accountToken: string | undefined, displayName: string) =>
    call<{ token: string; created: boolean; participant: CameraParticipant }>(
      `/guest/join/${encodeURIComponent(joinCode)}`,
      {
        method: "POST",
        body: JSON.stringify({ display_name: displayName }),
        headers: accountToken ? { "X-Luma-Account": accountToken } : undefined,
      },
    ),

  me: (token: string) => call<CameraParticipant>("/guest/me", { token }),

  reserve: (token: string) =>
    call<Reservation>("/guest/shots/reserve", {
      method: "POST",
      body: JSON.stringify({ content_type: "image/jpeg" }),
      token,
    }),

  confirm: (token: string, mediaId: string, byteSize: number) =>
    call<{ shots_committed: number; shots_remaining: number }>(
      `/guest/shots/${mediaId}/confirm`,
      { method: "POST", body: JSON.stringify({ byte_size: byteSize }), token },
    ),

  abandon: (token: string, mediaId: string) =>
    call<void>(`/guest/shots/${mediaId}/abandon`, { method: "POST", body: "{}", token }),

  photos: (token: string) => call<Photo[]>("/guest/photos", { token }),

  deletePhoto: (token: string, photoId: string) =>
    call<void>(`/guest/photos/${photoId}`, { method: "DELETE", token }),
};

/**
 * Upload a file straight to object storage.
 *
 * `uploadAsync` streams from disk, so a 5 MB photograph never passes through
 * JavaScript memory — which is the whole reason the queue stores files rather
 * than base64.
 */
export async function putFile(url: string, fileUri: string): Promise<number> {
  const result = await FileSystem.uploadAsync(url, fileUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": "image/jpeg" },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new ApiError("upload failed", result.status);
  }

  const info = await FileSystem.getInfoAsync(fileUri);
  return info.exists && "size" in info ? info.size : 0;
}
