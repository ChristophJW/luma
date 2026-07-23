/**
 * The offline upload queue.
 *
 * A wedding cellar with one bar of reception is the normal case, not the edge
 * case (DESIGN.md, differentiator #3). So a photograph is written to IndexedDB
 * the instant it is taken, and only removed once the server has confirmed it.
 * Closing the tab, losing signal or the phone dying loses nothing.
 *
 * Raw IndexedDB rather than a wrapper library — the whole camera has a 30 KB
 * budget and this is about forty lines of API surface.
 */

const DB_NAME = "luma";
const DB_VERSION = 1;
const STORE = "pending";

export interface PendingShot {
  id: string;
  blob: Blob;
  /** Set once a slot has been reserved, so a retry confirms rather than re-reserves. */
  mediaId?: string;
  uploadUrl?: string;
  /** Set once the bytes are in storage but the confirm has not landed. */
  uploaded?: boolean;
  createdAt: number;
  attempts: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export const queue = {
  async add(shot: PendingShot): Promise<void> {
    await tx("readwrite", (store) => store.put(shot));
  },

  async update(shot: PendingShot): Promise<void> {
    await tx("readwrite", (store) => store.put(shot));
  },

  async remove(id: string): Promise<void> {
    await tx("readwrite", (store) => store.delete(id));
  },

  async all(): Promise<PendingShot[]> {
    const shots = await tx<PendingShot[]>("readonly", (store) => store.getAll());
    return shots.sort((a, b) => a.createdAt - b.createdAt);
  },

  async count(): Promise<number> {
    return await tx<number>("readonly", (store) => store.count());
  },
};

/** IndexedDB is unavailable in some private modes; the camera must still work. */
export const queueAvailable = typeof indexedDB !== "undefined";
