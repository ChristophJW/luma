import { Platform } from "react-native";

/**
 * Session token storage.
 *
 * localStorage on web, SecureStore on native. Kept behind one interface so
 * calling code never branches on platform.
 */

const KEY = "luma.session.token";

// Imported lazily so the web bundle never pulls in the native module.
async function secureStore() {
  return await import("expo-secure-store");
}

export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(KEY, token);
    return;
  }
  const store = await secureStore();
  await store.setItemAsync(KEY, token);
}

export async function loadToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  }
  const store = await secureStore();
  return await store.getItemAsync(KEY);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(KEY);
    return;
  }
  const store = await secureStore();
  await store.deleteItemAsync(KEY);
}
