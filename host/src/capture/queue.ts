/**
 * The native upload queue.
 *
 * The web camera keeps blobs in IndexedDB. Native gets something better: the
 * photograph is a real file on disk, so nothing is held in JavaScript memory
 * and a multi-megabyte capture costs nothing to keep queued.
 *
 * A photograph is written to the queue the instant it is taken and only
 * removed once the server confirms it. Losing signal, backgrounding the app
 * or force-quitting loses nothing.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

const INDEX_KEY = "luma.capture.queue";
const QUEUE_DIR = `${FileSystem.documentDirectory}luma-queue/`;

export interface QueuedShot {
  id: string;
  /** A file on disk, not bytes in memory. */
  uri: string;
  eventId: string;
  /** Set once a slot is reserved, so a retry confirms rather than re-reserves. */
  mediaId?: string;
  uploadUrl?: string;
  /** Set once the bytes are in storage but the confirm has not landed. */
  uploaded?: boolean;
  createdAt: number;
  attempts: number;
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(QUEUE_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true });
}

async function readIndex(): Promise<QueuedShot[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedShot[];
  } catch {
    // A corrupt index must not brick the camera.
    return [];
  }
}

async function writeIndex(shots: QueuedShot[]): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(shots));
}

export const queue = {
  /** Move the capture out of the cache, which the OS may clear at any time. */
  async add(shot: Omit<QueuedShot, "uri"> & { uri: string }): Promise<QueuedShot> {
    await ensureDir();
    const destination = `${QUEUE_DIR}${shot.id}.jpg`;
    await FileSystem.moveAsync({ from: shot.uri, to: destination });

    const stored: QueuedShot = { ...shot, uri: destination };
    await writeIndex([...(await readIndex()), stored]);
    return stored;
  },

  async update(shot: QueuedShot): Promise<void> {
    const shots = await readIndex();
    await writeIndex(shots.map((entry) => (entry.id === shot.id ? shot : entry)));
  },

  async remove(id: string): Promise<void> {
    const shots = await readIndex();
    const going = shots.find((entry) => entry.id === id);
    await writeIndex(shots.filter((entry) => entry.id !== id));
    if (going) {
      await FileSystem.deleteAsync(going.uri, { idempotent: true }).catch(() => undefined);
    }
  },

  async all(): Promise<QueuedShot[]> {
    return (await readIndex()).sort((a, b) => a.createdAt - b.createdAt);
  },

  async count(): Promise<number> {
    return (await readIndex()).length;
  },
};
