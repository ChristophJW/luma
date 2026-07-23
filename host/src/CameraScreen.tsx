/**
 * The host's own camera. DESIGN.md §7 applies here exactly as it does to the
 * guest camera: dark, full bleed, chrome floating over the feed, everything
 * interactive in the bottom quarter, the counter never leaving.
 *
 * A host photographing their own event is a participant in it, so this uses
 * the same endpoints and the same shot accounting as everybody else.
 */

import { CameraView, useCameraPermissions } from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { glow, ink, paper, radius, safelight, space } from "@luma/tokens";

import { type LumaEvent } from "./api";
import { type CameraParticipant, capture } from "./capture/api";
import { queue } from "./capture/queue";
import { drain, onQueueChange, startDraining } from "./capture/uploader";
import { useT } from "./i18n";
import { Button, styles as ui } from "./ui";

export function CameraScreen({
  event,
  accountToken,
  displayName,
  onClose,
  onOpenPhotos,
}: {
  event: LumaEvent;
  accountToken: string;
  displayName: string;
  onClose: () => void;
  onOpenPhotos: (cameraToken: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();

  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [token, setToken] = useState<string | null>(null);
  const [participant, setParticipant] = useState<CameraParticipant | null>(null);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [taken, setTaken] = useState(0);
  const [pending, setPending] = useState(0);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Join our own event to obtain a camera session.
  useEffect(() => {
    (async () => {
      try {
        const result = await capture.join(event.join_code, accountToken, displayName || "Host");
        setToken(result.token);
        setParticipant(result.participant);
        setTaken(result.participant.shots_committed);
      } catch {
        setError(t("camera.joinFailed"));
      }
    })();
  }, [event.join_code, accountToken, displayName]);

  useEffect(() => {
    if (!token) return;
    const stopWatching = onQueueChange(setPending);
    const stopDraining = startDraining(token);
    return () => {
      stopWatching();
      stopDraining();
    };
  }, [token]);

  const total = participant?.shot_limit ?? event.shots_per_guest;
  const remaining = total - taken;
  const low = remaining <= 3 && remaining > 0;

  const shoot = useCallback(async () => {
    if (!camera.current || !token || remaining <= 0) return;

    // Three confirmations, because a wedding is loud and dark.
    setFlash(true);
    setTimeout(() => setFlash(false), 90);

    const photo = await camera.current.takePictureAsync({
      quality: 0.92,
      // Never base64: a 5 MB photograph must not pass through JS memory.
      skipProcessing: false,
      // EXIF is dropped rather than uploaded — GPS in a wedding photograph is
      // the kind of thing nobody asked for.
      exif: false,
    });
    if (!photo?.uri) return;

    await queue.add({
      id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      uri: photo.uri,
      eventId: event.id,
      createdAt: Date.now(),
      attempts: 0,
    });

    setTaken((count) => count + 1);
    void drain(token);
  }, [token, remaining, event.id]);

  if (!permission) {
    return <Centre><ActivityIndicator color={paper[100]} /></Centre>;
  }

  if (!permission.granted) {
    return (
      <Centre>
        <Text style={[ui.display, styles.onDark]}>{t("camera.permissionHeading")}</Text>
        <Text style={styles.body}>{t("camera.permissionBody")}</Text>
        <View style={styles.permissionActions}>
          <Button label={t("camera.allow")} onPress={() => void requestPermission()} />
          <Button label={t("wizard.cancel")} variant="quiet" onPress={onClose} />
        </View>
      </Centre>
    );
  }

  if (error) {
    return (
      <Centre>
        <Text style={styles.body}>{error}</Text>
        <View style={styles.permissionActions}>
          <Button label={t("wizard.cancel")} variant="quiet" onPress={onClose} />
        </View>
      </Centre>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} />

      {/* Scrims are mandatory — chrome must survive the lens pointing at a
          white tablecloth. */}
      <View style={[styles.scrim, styles.scrimTop]} pointerEvents="none" />
      <View style={[styles.scrim, styles.scrimBottom]} pointerEvents="none" />

      <View style={[styles.hudTop, { top: insets.top + space[3] }]}>
        <Pressable onPress={onClose} accessibilityLabel={t("wizard.cancel")} style={styles.chrome}>
          <Text style={styles.chromeGlyph}>✕</Text>
        </Pressable>

        <View style={styles.counterBlock}>
          <Text style={[styles.counter, low && styles.counterLow]}>
            {taken}
            <Text style={styles.counterTotal}> / {total}</Text>
          </Text>
          <Text style={styles.counterLabel}>
            {low
              ? t("camera.shotsLeft", { count: remaining })
              : t("camera.of", { taken, total })}
          </Text>
        </View>

        {pending > 0 ? (
          <Text style={styles.queued}>{t("camera.queued", { count: pending })}</Text>
        ) : (
          <View style={styles.chrome} />
        )}
      </View>

      <View style={[styles.hudBottom, { bottom: insets.bottom + space[8] }]}>
        <Pressable
          onPress={() => setFacing((current) => (current === "back" ? "front" : "back"))}
          accessibilityLabel={t("camera.flip")}
          style={styles.chrome}
        >
          <View style={styles.flipGlyph} />
        </Pressable>

        <Pressable
          onPress={shoot}
          disabled={!token || remaining <= 0}
          accessibilityLabel={t("camera.shutter")}
          style={({ pressed }) => [
            styles.shutter,
            pressed && styles.shutterPressed,
            (!token || remaining <= 0) && styles.shutterDisabled,
          ]}
        />

        <Pressable
          onPress={() => token && onOpenPhotos(token)}
          accessibilityLabel={t("gallery.open")}
          style={styles.chrome}
        >
          <View style={styles.gridGlyph}>
            <View style={styles.gridCell} />
            <View style={styles.gridCell} />
            <View style={styles.gridCell} />
            <View style={styles.gridCell} />
          </View>
        </Pressable>
      </View>

      {flash ? <View style={styles.flash} pointerEvents="none" /> : null}
    </View>
  );
}

function Centre({ children }: { children: React.ReactNode }) {
  return <View style={styles.centre}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ink[900] },
  centre: {
    flex: 1,
    justifyContent: "center",
    gap: space[4],
    padding: space[6],
    backgroundColor: ink[900],
  },
  onDark: { color: paper[100] },
  body: { fontSize: 17, lineHeight: 25, color: ink[500] },
  permissionActions: { gap: space[2], marginTop: space[4] },

  scrim: { position: "absolute", left: 0, right: 0, height: 110 },
  scrimTop: { top: 0, backgroundColor: "rgba(20,17,15,0.55)" },
  scrimBottom: { bottom: 0, backgroundColor: "rgba(20,17,15,0.55)" },

  hudTop: {
    position: "absolute",
    left: space[4],
    right: space[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  counterBlock: { alignItems: "center" },
  counter: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "600",
    color: glow[400],
    fontVariant: ["tabular-nums"],
  },
  counterLow: { color: safelight, fontWeight: "700" },
  counterTotal: { fontSize: 18, color: paper[100], fontWeight: "400" },
  counterLabel: { fontSize: 12, letterSpacing: 1, color: paper[100] },
  queued: {
    fontSize: 12,
    color: paper[100],
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radius.pill,
    backgroundColor: "rgba(20,17,15,0.55)",
    overflow: "hidden",
  },

  hudBottom: {
    position: "absolute",
    left: space[6],
    right: space[6],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: paper[100],
    borderWidth: 3,
    borderColor: "rgba(20,17,15,0.2)",
  },
  shutterPressed: { transform: [{ scale: 0.9 }] },
  shutterDisabled: { opacity: 0.4 },

  chrome: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20,17,15,0.45)",
  },
  chromeGlyph: { color: paper[100], fontSize: 18 },
  flipGlyph: {
    width: 18,
    height: 14,
    borderWidth: 1.5,
    borderColor: paper[100],
    borderRadius: 3,
  },
  gridGlyph: { width: 16, height: 16, flexDirection: "row", flexWrap: "wrap", gap: 2 },
  gridCell: { width: 7, height: 7, backgroundColor: paper[100], borderRadius: 1 },

  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: paper[100], opacity: 0.15 },
});
