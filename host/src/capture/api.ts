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

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const response = await fetch(`${API_BASE}/api${path}`, {
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
   * Join the event as its host.
   *
   * The account header links the participation to the signed-in user, so a
   * host ends up with one identity rather than an anonymous second one.
   */
  join: (joinCode: string, accountToken: string, displayName: string) =>
    call<{ token: string; created: boolean; participant: CameraParticipant }>(
      `/guest/join/${encodeURIComponent(joinCode)}`,
      {
        method: "POST",
        body: JSON.stringify({ display_name: displayName }),
        headers: { "X-Luma-Account": accountToken },
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
