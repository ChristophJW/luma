/**
 * Draining the native queue.
 *
 * Each shot walks reserve → PUT → confirm, and every step is written to disk
 * before the next is attempted. Losing signal between the upload and the
 * confirm retries only the confirm — never a second reservation, never a lost
 * photograph.
 *
 * Deliberately the same shape as the guest camera's uploader; the difference
 * is files on disk rather than blobs in IndexedDB.
 */

import { AppState } from "react-native";

import { ApiError } from "../api";
import { capture, putFile } from "./api";
import { type QueuedShot, queue } from "./queue";

const MAX_ATTEMPTS = 6;

type Listener = (pending: number) => void;

let draining = false;
let listeners: Listener[] = [];

export function onQueueChange(listener: Listener): () => void {
  listeners.push(listener);
  void queue.count().then(listener);
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

async function announce() {
  const pending = await queue.count();
  for (const listener of listeners) listener(pending);
}

async function send(token: string, shot: QueuedShot): Promise<void> {
  // Reserve once. A retry must never spend a second shot.
  if (!shot.mediaId || !shot.uploadUrl) {
    const reservation = await capture.reserve(token);
    shot.mediaId = reservation.media_id;
    shot.uploadUrl = reservation.upload_url;
    await queue.update(shot);
  }

  let size = 0;
  if (!shot.uploaded) {
    size = await putFile(shot.uploadUrl, shot.uri);
    shot.uploaded = true;
    await queue.update(shot);
  }

  // Idempotent server-side, so retrying this is free.
  await capture.confirm(token, shot.mediaId, size);
  await queue.remove(shot.id);
}

export async function drain(token: string): Promise<void> {
  if (draining) return;
  draining = true;

  try {
    for (const shot of await queue.all()) {
      try {
        await send(token, shot);
        await announce();
      } catch (error) {
        shot.attempts += 1;
        const status = error instanceof ApiError ? error.status : 0;

        // 409/404/401 will not improve with retrying — out of shots, event
        // closed, reservation expired. Holding the photograph forever is
        // worse than admitting it is not going.
        const permanent = status === 409 || status === 404 || status === 401;

        if (permanent || shot.attempts >= MAX_ATTEMPTS) {
          if (shot.mediaId && !shot.uploaded) {
            // Hand the shot back so it can be retaken immediately.
            await capture.abandon(token, shot.mediaId).catch(() => undefined);
          }
          await queue.remove(shot.id);
          await announce();
        } else {
          await queue.update(shot);
        }

        // A network failure ends the pass; the next trigger resumes it.
        if (status === 0) break;
      }
    }
  } finally {
    draining = false;
    await announce();
  }
}

/** Drain on a timer and whenever the app returns to the foreground. */
export function startDraining(token: string): () => void {
  const run = () => void drain(token);

  run();
  const timer = setInterval(run, 15_000);
  const subscription = AppState.addEventListener("change", (next) => {
    if (next === "active") run();
  });

  return () => {
    clearInterval(timer);
    subscription.remove();
  };
}
