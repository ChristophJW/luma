/**
 * Guest mode inside the host app.
 *
 * Someone who is not signing in as a host — a guest at the party holding the
 * same app — scans the event QR, gives a name, and lands in the very same
 * camera the host uses. No account, no sign-in: the join is anonymous, exactly
 * as the guest web app does it.
 *
 * A small stack, checked innermost-first like the one in App.tsx: photos over
 * the camera, the camera over the name, the name over the scanner.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { glow, ink, paper, radius, space } from "@luma/tokens";

import { CameraScreen } from "./CameraScreen";
import { PhotosScreen } from "./PhotosScreen";
import { ScanScreen } from "./ScanScreen";
import { type CameraParticipant } from "./capture/api";
import { type GuestStore, loadGuestStore, saveGuestStore } from "./guestSession";
import { useT } from "./i18n";
import { Wordmark } from "./Wordmark";

// The palette has no green — it is deliberately warm (amber, red). A muted
// sage reads as "done" without a bright green shouting against the warm tones.
const SUCCESS = "#4F9D69";

/**
 * How many pixels the on-screen keyboard is covering at the bottom.
 *
 * KeyboardAvoidingView is a no-op on react-native-web — where this app spends
 * most of its life — so it cannot be relied on. Instead: the browser's
 * visualViewport reports the shrunk region directly, and native gets the
 * keyboard height from the Keyboard events. One number, every platform.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") {
      const vv = typeof window !== "undefined" ? window.visualViewport : null;
      if (!vv) return;
      const update = () => {
        // The slice of the layout viewport the keyboard sits over.
        const covered = window.innerHeight - vv.height - vv.offsetTop;
        setInset(covered > 1 ? covered : 0);
      };
      update();
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
      return () => {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      };
    }

    // iOS reports a frame as the keyboard animates; Android only fires "did".
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event) =>
      setInset(event.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener(hideEvent, () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}

export function GuestFlow({ onExit }: { onExit: () => void }) {
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  // A camera session opened over the top for the gallery, mirroring Home.
  const [photos, setPhotos] = useState<{ token: string; title: string } | null>(null);

  // What this guest has joined before. Held in a ref so the scan handler reads
  // the current value without being torn down and re-created on every save.
  const store = useRef<GuestStore>({ events: {} });
  const [, forceStore] = useState(0);
  useEffect(() => {
    void loadGuestStore().then((loaded) => {
      store.current = loaded;
      forceStore((n) => n + 1);
    });
  }, []);

  const remembered = joinCode ? store.current.events[joinCode] : undefined;

  const handleCode = useCallback((code: string) => {
    const known = store.current.events[code];
    setJoinCode(code);
    // A code seen before skips the name step entirely — the whole point of
    // remembering it. A new one still asks.
    setName(known ? known.name : null);
  }, []);

  // Depends only on joinCode, which is fixed while the camera is mounted, so
  // its identity is stable there — a fresh function every render would restart
  // the camera's join effect in a loop.
  const remember = useCallback(
    (token: string, participant: CameraParticipant) => {
      if (!joinCode) return;
      const next: GuestStore = {
        lastName: participant.display_name,
        events: {
          ...store.current.events,
          [joinCode]: {
            name: participant.display_name,
            token,
            title: participant.event_title,
          },
        },
      };
      store.current = next;
      void saveGuestStore(next);
    },
    [joinCode],
  );

  if (joinCode === null) {
    return <ScanScreen onCode={handleCode} onClose={onExit} />;
  }

  if (name === null) {
    return (
      <NameScreen
        defaultName={store.current.lastName ?? ""}
        onContinue={setName}
        onBack={() => setJoinCode(null)}
      />
    );
  }

  if (photos) {
    return (
      <PhotosScreen
        token={photos.token}
        title={photos.title}
        onClose={() => setPhotos(null)}
      />
    );
  }

  return (
    <CameraScreen
      joinCode={joinCode}
      displayName={name}
      cachedToken={remembered?.token}
      onJoined={remember}
      onClose={() => setJoinCode(null)}
      onOpenPhotos={(token, title) => setPhotos({ token, title })}
    />
  );
}

/**
 * The one thing a guest must give before the camera: a name, so their
 * photographs are attributed. Light, like the sign-in screen it sits beside —
 * the dark surfaces start at the camera.
 */
function NameScreen({
  defaultName,
  onContinue,
  onBack,
}: {
  /** Prefilled from the last name this guest used, for a brand-new event. */
  defaultName: string;
  onContinue: (name: string) => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const [value, setValue] = useState(defaultName);
  const trimmed = value.trim();
  const keyboard = useKeyboardInset();

  // When the keyboard is up, the bottom padding becomes the keyboard's height
  // so the visible region ends exactly at its top edge; the scroll view then
  // keeps the input and its button inside that region. When it's down, the
  // usual safe-area padding applies.
  const bottomPad = keyboard > 0 ? keyboard + space[3] : insets.bottom + space[6];

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + space[6], paddingBottom: bottomPad }]}>
      <View style={styles.brand}>
        <Wordmark />
      </View>
      <ScrollView
        style={styles.centre}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.form}>
          {/* Confirms the scan a moment ago actually landed. */}
          <View style={styles.scanned}>
            <View style={styles.check}>
              <Text style={styles.checkGlyph}>✓</Text>
            </View>
            <Text style={styles.scannedLabel}>{t("guest.scanned")}</Text>
          </View>

          <Text style={styles.title}>{t("guest.nameTitle")}</Text>
          <Text style={styles.body}>{t("guest.nameLede")}</Text>

          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder={t("guest.namePlaceholder")}
            placeholderTextColor={ink[600]}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={() => trimmed && onContinue(trimmed)}
            accessibilityLabel={t("guest.nameLabel")}
          />

          <Pressable
            onPress={() => trimmed && onContinue(trimmed)}
            disabled={!trimmed}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              !trimmed && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonLabel}>{t("guest.nameContinue")}</Text>
          </Pressable>

          <Pressable onPress={onBack} accessibilityRole="button" style={styles.linkTarget}>
            <Text style={styles.link}>{t("guest.rescan")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space[6], backgroundColor: paper[100] },
  brand: { width: "100%", maxWidth: 420, alignSelf: "center" },
  centre: { flex: 1, width: "100%" },
  scroll: { flexGrow: 1, justifyContent: "center" },
  form: { width: "100%", maxWidth: 420, alignSelf: "center", gap: space[3] },
  scanned: { flexDirection: "row", alignItems: "center", gap: space[2] },
  check: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: SUCCESS,
    alignItems: "center",
    justifyContent: "center",
  },
  checkGlyph: { color: paper["000"], fontSize: 16, fontWeight: "700", lineHeight: 20 },
  scannedLabel: { fontSize: 15, fontWeight: "500", color: SUCCESS },
  title: { fontSize: 32, lineHeight: 38, color: ink[900] },
  body: { fontSize: 16, lineHeight: 24, color: ink[500] },
  input: {
    minHeight: 52,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderWidth: 1,
    borderColor: paper[300],
    borderRadius: radius.control,
    backgroundColor: paper["000"],
    fontSize: 17,
    color: ink[900],
  },
  button: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: ink[900],
    marginTop: space[2],
  },
  buttonDisabled: { backgroundColor: paper[300] },
  buttonPressed: { opacity: 0.9 },
  buttonLabel: { color: paper["000"], fontSize: 16, fontWeight: "500" },
  linkTarget: { minHeight: 44, justifyContent: "center", marginTop: space[2] },
  link: { fontSize: 15, color: glow[700] },
});
