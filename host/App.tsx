import { Fraunces_400Regular, useFonts } from "@expo-google-fonts/fraunces";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
// react-native's own SafeAreaView is deprecated. The provider supplies the
// measured insets; each screen applies them to its own container, because
// a wrapping SafeAreaView silently does nothing when a child manages its
// own full-height layout.
// Gesture handler needs a root view above everything that uses gestures.
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { glow, ink, paper, radius, space } from "@luma/tokens";

import { EventWizard } from "./src/EventWizard";
import { PencilIcon, QrIcon } from "./src/Icons";
import { CameraScreen } from "./src/CameraScreen";
import { EventDetail } from "./src/EventDetail";
import { PhotosScreen } from "./src/PhotosScreen";
import { QrScreen } from "./src/QrScreen";
import { I18nProvider, useT } from "./src/i18n";
import { type LumaEvent, type User, api, events } from "./src/api";
import { clearToken, loadToken } from "./src/session";
import { SignIn } from "./src/SignIn";
import { Body, Button, styles as ui } from "./src/ui";

type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "signed-in"; user: User };

export default function App() {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Display font. Rendering is not blocked on it — a missing headline is
  // worse than one that swaps face a moment later.
  useFonts({ Fraunces_400Regular });

  useEffect(() => {
    (async () => {
      const token = await loadToken();
      if (!token) {
        setState({ kind: "signed-out" });
        return;
      }
      try {
        setState({ kind: "signed-in", user: await api.me(token) });
      } catch {
        await clearToken();
        setState({ kind: "signed-out" });
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
        <View style={styles.screen}>
        <StatusBar style="dark" />
        {state.kind === "loading" ? (
          <View style={styles.centre}>
            <ActivityIndicator color={ink[500]} />
          </View>
        ) : state.kind === "signed-out" ? (
          <SignIn onSignedIn={(user) => setState({ kind: "signed-in", user })} />
        ) : (
          <Home user={state.user} onSignedOut={() => setState({ kind: "signed-out" })} />
        )}
        </View>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Home({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const [token, setToken] = useState<string | null>(null);
  const [list, setList] = useState<LumaEvent[] | null>(null);
  // undefined = closed, null = creating, an event = editing that one.
  const [wizard, setWizard] = useState<LumaEvent | null | undefined>(undefined);
  const [showingQr, setShowingQr] = useState<LumaEvent | undefined>(undefined);
  const [detail, setDetail] = useState<LumaEvent | undefined>(undefined);
  const [shooting, setShooting] = useState<LumaEvent | undefined>(undefined);
  // Set once a camera session exists, so the photos screen can reuse it.
  const [photosToken, setPhotosToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const stored = await loadToken();
    setToken(stored);
    if (!stored) return;
    try {
      setList(await events.list(stored));
      setError(null);
    } catch {
      setError(t("error.loadEvents"));
    }
  }, []);

  // The list shows live counters, so it has to keep itself current. Without
  // this it only fetched on mount — a guest joining while the host watched
  // the list changed nothing on screen.
  useEffect(() => {
    void refresh();

    const timer = setInterval(() => void refresh(), 15_000);

    // AppState, not `document.visibilitychange`: there is no `document` on
    // iOS or Android, and referencing it crashed the app in Expo Go. React
    // Native for Web maps AppState onto visibilitychange, so this one API
    // covers every target.
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refresh]);

  async function signOut() {
    if (token) {
      try {
        await api.logout(token);
      } catch {
        // Revoking server-side is best effort; clearing locally is what counts.
      }
    }
    await clearToken();
    onSignedOut();
  }

  // Order matters: these are a stack, so the innermost screen must be checked
  // first. With `detail` tested before `wizard`, opening the wizard from the
  // detail page set the state but kept rendering the detail page.
  if (wizard !== undefined && token) {
    return (
      <EventWizard
        token={token}
        event={wizard ?? undefined}
        onDone={(saved) => {
          setWizard(undefined);
          // The detail page may be open underneath; show it the new values
          // rather than the copy it was opened with.
          setDetail((current) => (current && current.id === saved.id ? saved : current));
          void refresh();
        }}
        onCancel={() => setWizard(undefined)}
      />
    );
  }

  if (photosToken && shooting) {
    return (
      <PhotosScreen
        token={photosToken}
        title={shooting.title}
        onClose={() => setPhotosToken(undefined)}
      />
    );
  }

  if (shooting && token) {
    return (
      <CameraScreen
        event={shooting}
        accountToken={token}
        displayName={user.display_name || user.email}
        onClose={() => {
          setShooting(undefined);
          void refresh();
        }}
        onOpenPhotos={setPhotosToken}
      />
    );
  }

  if (showingQr) {
    return <QrScreen event={showingQr} onClose={() => setShowingQr(undefined)} />;
  }

  if (detail && token) {
    return (
      <EventDetail
        token={token}
        event={detail}
        onEdit={() => setWizard(detail)}
        onShowQr={() => setShowingQr(detail)}
        onClose={() => setDetail(undefined)}
        onChanged={() => void refresh()}
        onTakePhotos={() => setShooting(detail)}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[16] },
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.eyebrow}>LUMA</Text>
        <Text style={ui.display}>{t("events.title")}</Text>
        <Body muted>{t("events.signedInAs", { email: user.email })}</Body>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {list === null ? (
          <ActivityIndicator color={ink[500]} />
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Body muted>{t("events.empty")}</Body>
          </View>
        ) : (
          <View style={styles.list}>
            {list.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                t={t}
                onEdit={() => setWizard(event)}
                onShowQr={() => setShowingQr(event)}
                onOpen={() => setDetail(event)}
              />
            ))}
          </View>
        )}

        <Button label={t("events.create")} onPress={() => setWizard(null)} />
        <Pressable onPress={signOut} accessibilityRole="button" style={styles.linkTarget}>
          <Text style={styles.link}>{t("events.signOut")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function EventCard({
  event,
  t,
  onEdit,
  onShowQr,
  onOpen,
}: {
  event: LumaEvent;
  t: ReturnType<typeof useT>;
  onEdit: () => void;
  onShowQr: () => void;
  onOpen: () => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={event.title}
        style={({ pressed }) => [styles.cardBody, pressed && styles.iconButtonPressed]}
      >
      <View style={styles.cardHead}>
        <Text style={ui.displaySmall}>{event.title}</Text>
        <Text style={[styles.badge, event.status === "published" && styles.badgeLive]}>
          {event.status}
        </Text>
      </View>
      {event.location ? <Text style={styles.cardMeta}>{event.location}</Text> : null}
      <Text style={styles.cardMeta}>
        {t("events.shotsAndGuests", {
          shots: event.shots_per_guest,
          guests: event.guest_capacity,
        })}
      </Text>
      </Pressable>
      <View style={styles.cardFooter}>
        <View style={styles.cardStats}>
          <Stat value={event.participant_count} label={t("events.joined")} />
          <Stat value={event.photo_count} label={t("events.photos")} />
          <Stat value={event.join_code} label={t("events.code")} />
        </View>
        {/* Always visible — nothing may depend on hover. DESIGN.md §11.
            With no visible label, the accessibility label carries the whole
            meaning, so it names the event too. */}
        <View style={styles.cardActions}>
          <Pressable
            onPress={onShowQr}
            accessibilityRole="button"
            accessibilityLabel={`${t("events.qr")}: ${event.title}`}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <QrIcon />
          </Pressable>
          <Pressable
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel={`${t("events.edit")}: ${event.title}`}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <PencilIcon />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Light by default — people plan weddings on laptops in daylight. DESIGN.md §11.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: paper[100] },
  centre: { flex: 1, justifyContent: "center", padding: space[6] },
  scroll: { padding: space[6], paddingBottom: space[16] },
  content: { width: "100%", maxWidth: 660, alignSelf: "center", gap: space[4] },
  eyebrow: { fontSize: 13, fontWeight: "500", letterSpacing: 1.2, color: ink[500] },
  error: { fontSize: 15, color: "#C2413A" },
  empty: {
    padding: space[6],
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: paper[300],
  },
  list: { gap: space[3] },
  card: {
    padding: space[4],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: paper[300],
    backgroundColor: paper["000"],
    gap: space[2],
  },
  cardHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space[3] },
  badge: {
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: ink[500],
  },
  badgeLive: { color: glow[700], fontWeight: "600" },
  cardMeta: { fontSize: 14, color: ink[500] },
  cardFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space[3],
    marginTop: space[1],
  },
  cardStats: { flexDirection: "row", gap: space[6] },
  cardBody: { gap: space[2] },
  cardActions: { flexDirection: "row", gap: space[2] },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: paper[300],
  },
  iconButtonPressed: { opacity: 0.9 },
  stat: { gap: 2 },
  statValue: { fontSize: 20, color: ink[900], fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 12, letterSpacing: 0.8, color: ink[500] },
  linkTarget: { minHeight: 44, justifyContent: "center" },
  link: { fontSize: 15, color: glow[700] },
});
