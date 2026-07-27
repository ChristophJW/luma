/**
 * What a guest has already joined, remembered between visits.
 *
 * A guest who scans an event once should not be asked for their name again,
 * and — more than that — should return to the *same* camera session, so their
 * shot count and photographs carry over rather than starting fresh. So the
 * camera token is kept per join code, keyed alongside the name they gave.
 *
 * AsyncStorage rather than SecureStore: this is a JSON map, not a single
 * secret, and AsyncStorage is backed by localStorage on web — one code path
 * for every platform. The token here grants only the guest's own capture
 * session, exactly what the guest web app keeps in localStorage too.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "luma.guest.store";

export interface GuestEvent {
  /** The name the guest gave when they joined. */
  name: string;
  /** Their camera session token, reused so the same roll carries over. */
  token: string;
  /** The event's title, for the gallery header. */
  title: string;
}

export interface GuestStore {
  /** The last name used, to prefill the field for a brand-new event. */
  lastName?: string;
  /** Joined events, keyed by join code. */
  events: Record<string, GuestEvent>;
}

export async function loadGuestStore(): Promise<GuestStore> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return { events: {} };
  try {
    const parsed = JSON.parse(raw) as GuestStore;
    return { lastName: parsed.lastName, events: parsed.events ?? {} };
  } catch {
    // A corrupt blob must not lock a guest out of joining.
    return { events: {} };
  }
}

export async function saveGuestStore(store: GuestStore): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(store));
}
