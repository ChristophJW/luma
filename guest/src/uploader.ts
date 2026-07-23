/**
 * Draining the queue.
 *
 * Each shot walks: reserve → PUT → confirm. Every step is resumable, because
 * the state of a half-finished upload is written to IndexedDB before the next
 * step is attempted. A guest who loses signal between the PUT and the confirm
 * gets the confirm retried later rather than a lost photograph or a lost shot.
 */

import { ApiError, api, putToStorage } from "./api";
import { type PendingShot, queue } from "./queue";

/** After this many failures the reservation is handed back rather than held. */
const MAX_ATTEMPTS = 6;

type Listener = (state: { pending: number; uploading: boolean }) => void;

let draining = false;
let listeners: Listener[] = [];

export function onQueueChange(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

async function announce(uploading: boolean) {
  const pending = await queue.count();
  for (const listener of listeners) listener({ pending, uploading });
}

async function send(token: string, shot: PendingShot): Promise<void> {
  // 1. Reserve — but only once. A retry must never spend a second shot.
  if (!shot.mediaId || !shot.uploadUrl) {
    const reservation = await api.reserve(token, shot.blob.type || "image/jpeg");
    shot.mediaId = reservation.media_id;
    shot.uploadUrl = reservation.upload_url;
    await queue.update(shot);
  }

  // 2. Upload the bytes.
  if (!shot.uploaded) {
    await putToStorage(shot.uploadUrl, shot.blob);
    shot.uploaded = true;
    await queue.update(shot);
  }

  // 3. Confirm. Idempotent server-side, so a retry here is free.
  await api.confirm(token, shot.mediaId, shot.blob.size);
  await queue.remove(shot.id);
}

export async function drain(token: string): Promise<void> {
  if (draining) return;
  draining = true;
  await announce(true);

  try {
    for (const shot of await queue.all()) {
      try {
        await send(token, shot);
      } catch (error) {
        shot.attempts += 1;

        const status = error instanceof ApiError ? error.status : 0;

        // 409 means the server refused for a reason retrying will not fix —
        // out of shots, event closed, reservation expired. Holding the
        // photograph forever would be worse than admitting it is not going.
        const permanent = status === 409 || status === 404 || status === 401;

        if (permanent || shot.attempts >= MAX_ATTEMPTS) {
          if (shot.mediaId && !shot.uploaded) {
            // Give the shot back so the guest can retake immediately.
            try {
              await api.abandon(token, shot.mediaId);
            } catch {
              /* the reservation will expire on its own */
            }
          }
          await queue.remove(shot.id);
        } else {
          await queue.update(shot);
        }

        // Stop the pass on a network failure; the next trigger will resume.
        if (status === 0) break;
      }
    }
  } finally {
    draining = false;
    await announce(false);
  }
}

/**
 * Drain whenever there is a reason to believe it might work: on load, when
 * the network returns, and when the tab comes back to the foreground — iOS
 * suspends timers in a backgrounded tab, so `online` alone is not enough.
 */
export function startDraining(token: string): () => void {
  const run = () => void drain(token);

  run();
  const timer = setInterval(run, 15_000);
  globalThis.addEventListener("online", run);
  document.addEventListener("visibilitychange", run);

  return () => {
    clearInterval(timer);
    globalThis.removeEventListener("online", run);
    document.removeEventListener("visibilitychange", run);
  };
}
