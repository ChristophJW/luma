/**
 * The host's own camera. DESIGN.md §7 applies here exactly as it does to the
 * guest camera: dark, full bleed, chrome floating over the feed, everything
 * interactive in the bottom quarter, the counter never leaving.
 *
 * A host photographing their own event is a participant in it, so this uses
 * the same endpoints and the same shot accounting as everybody else.
 */

import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { glow, ink, paper, radius, safelight, space } from "@luma/tokens";

import { ApiError } from "./api";
import { type CameraParticipant, capture } from "./capture/api";
import { queue } from "./capture/queue";
import { drain, onQueueChange, startDraining } from "./capture/uploader";
import { useT } from "./i18n";
import { Button, styles as ui } from "./ui";
import { Zoomable } from "./Zoomable";

// Fixed, slightly-irregular angles for the fanned photo stack, back to front.
// The last entry (the newest photo) sits most upright and on top.
const CARD_SLOTS = [
  [{ translateX: -5 }, { translateY: 3 }, { rotate: "-12deg" }],
  [{ translateX: 5 }, { translateY: -2 }, { rotate: "8deg" }],
  [{ translateX: 0 }, { translateY: 0 }, { rotate: "-3deg" }],
] as const;

export function CameraScreen({
  joinCode,
  accountToken,
  displayName,
  cachedToken,
  onJoined,
  onClose,
  onOpenPhotos,
}: {
  joinCode: string;
  /** Absent for a guest who scanned in from the sign-in screen. */
  accountToken?: string;
  displayName: string;
  /**
   * A camera session from a previous visit to this event. When present it is
   * resumed rather than re-joined, so the guest returns to the same roll.
   */
  cachedToken?: string;
  /** Fired once a session is established, so the caller can remember it. */
  onJoined?: (cameraToken: string, participant: CameraParticipant) => void;
  onClose: () => void;
  onOpenPhotos: (cameraToken: string, eventTitle: string) => void;
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
  // A capture waiting to be kept or thrown away. Nothing is queued and no
  // shot is spent until it is kept.
  const [preview, setPreview] = useState<string | null>(null);
  // The most recent photographs (newest first, up to three), fanned out on the
  // gallery button. Local files the instant they are kept; the latest saved
  // photos when the screen is re-opened.
  const [recent, setRecent] = useState<string[]>([]);

  // Join our own event to obtain a camera session. Extracted rather than
  // inlined in the effect so the error screen can run it again — a failed
  // join is usually a dropped connection, which retrying fixes.
  const [joining, setJoining] = useState(false);

  const join = useCallback(async () => {
    setJoining(true);
    setError(null);
    try {
      // Resume a remembered session first. capture.me keeps the same
      // participant — and their shot count — rather than opening a second one.
      // If the token has since expired, fall through to a fresh join.
      if (cachedToken) {
        try {
          const participant = await capture.me(cachedToken);
          setToken(cachedToken);
          setParticipant(participant);
          setTaken(participant.shots_committed);
          onJoined?.(cachedToken, participant);
          return;
        } catch {
          /* stale token — join afresh below */
        }
      }

      const result = await capture.join(joinCode, accountToken, displayName || "Host");
      setToken(result.token);
      setParticipant(result.participant);
      setTaken(result.participant.shots_committed);
      onJoined?.(result.token, result.participant);
    } catch (caught) {
      // The server names the reason with a stable code; the wording comes
      // from here, in the reader's language. Showing the server's English
      // prose put an English sentence under a German heading.
      const code = caught instanceof ApiError ? caught.code : undefined;
      setError(
        code
          ? t(`refused.${code}` as "refused.event_closed")
          : t("camera.joinFailed"),
      );
    } finally {
      setJoining(false);
    }
  }, [joinCode, accountToken, displayName, cachedToken, onJoined]);

  useEffect(() => {
    void join();
  }, [join]);

  /**
   * One recovery path for the error screen.
   *
   * "Try again" has to fix whatever is actually broken, and from that screen
   * the person cannot tell whether the camera permission or the connection
   * was the problem. So it asks for permission when that is missing, then
   * retries the join — rather than retrying only one of the two and appearing
   * to do nothing.
   */
  const retry = useCallback(async () => {
    if (permission && !permission.granted) {
      if (permission.canAskAgain === false) {
        await Linking.openSettings();
        return;
      }
      const asked = await requestPermission();
      if (!asked.granted) return;
    }
    await join();
  }, [permission, requestPermission, join]);

  useEffect(() => {
    if (!token) return;
    const stopWatching = onQueueChange(setPending);
    const stopDraining = startDraining(token);
    return () => {
      stopWatching();
      stopDraining();
    };
  }, [token]);

  // Seed the gallery-button thumbnail with the latest photo already saved, so
  // re-opening the camera shows the last shot rather than an empty grid. A
  // fresh capture below takes over instantly and without a round trip.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    capture
      .photos(token)
      .then((photos) => {
        if (cancelled || photos.length === 0) return;
        const latest = [...photos]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 3)
          .map((photo) => photo.url);
        setRecent((current) => (current.length ? current : latest));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  const total = participant?.shot_limit ?? 0;
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

    // Hold it for review. The shot is not spent yet — a blurry frame a
    // person immediately rejects should cost them nothing.
    setPreview(photo.uri);
  }, [token, remaining]);

  /** Commit the held capture: this is where a shot is finally spent. */
  const keep = useCallback(async () => {
    if (!preview || !token) return;

    const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;

    // Copy a stable thumbnail before queue.add moves the original into the
    // upload queue — where it is deleted once the upload confirms. Without this
    // the gallery button would go blank moments after a photo is kept.
    const thumb = `${FileSystem.documentDirectory}luma-last-${id}.jpg`;
    const thumbOk = await FileSystem.copyAsync({ from: preview, to: thumb })
      .then(() => true)
      .catch(() => false);

    await queue.add({
      id,
      uri: preview,
      // The queue only tags each shot; the uploader drains by camera token,
      // not by event. The join code is a stable per-event tag we always have,
      // account or not.
      eventId: joinCode,
      createdAt: Date.now(),
      attempts: 0,
    });

    if (thumbOk) {
      setRecent((previous) => {
        const next = [thumb, ...previous].slice(0, 3);
        // Delete any local thumbnail that fell off the end; leave server URLs.
        for (const gone of [thumb, ...previous].slice(3)) {
          if (gone.startsWith("file:")) {
            void FileSystem.deleteAsync(gone, { idempotent: true }).catch(() => undefined);
          }
        }
        return next;
      });
    }
    setPreview(null);
    setTaken((count) => count + 1);
    void drain(token);
  }, [preview, token, joinCode]);

  /** Throw it away, and the file with it — the cache would fill up otherwise. */
  const retake = useCallback(async () => {
    const going = preview;
    setPreview(null);
    if (going) {
      await FileSystem.deleteAsync(going, { idempotent: true }).catch(() => undefined);
    }
  }, [preview]);

  if (!permission) {
    return (
      <View style={[styles.messageRoot, styles.loadingCentre]}>
        <ActivityIndicator color={paper[100]} />
      </View>
    );
  }

  if (!permission.granted) {
    // Once Android has been told "don't ask again", requestPermission()
    // resolves denied without showing anything — so the button would look
    // broken. The only route left is the system settings screen.
    const blocked = permission.canAskAgain === false;

    return (
      <Message
        insets={insets}
        title={t(blocked ? "camera.permissionBlockedHeading" : "camera.permissionHeading")}
        body={t(blocked ? "camera.permissionBlockedBody" : "camera.permissionBody")}
        actions={
          <>
            <Button
              label={t(blocked ? "camera.openSettings" : "camera.allow")}
              tone="dark"
              onPress={() =>
                blocked ? void Linking.openSettings() : void requestPermission()
              }
            />
            <Button
              label={t("wizard.cancel")}
              variant="quiet"
              tone="dark"
              onPress={onClose}
            />
          </>
        }
      />
    );
  }

  if (error) {
    return (
      <Message
        insets={insets}
        title={t("camera.joinFailedTitle")}
        body={error}
        actions={
          <>
            <Button
              label={t("camera.tryAgain")}
              tone="dark"
              disabled={joining}
              onPress={() => void retry()}
            />
            <Button
              label={t("wizard.cancel")}
              variant="quiet"
              tone="dark"
              onPress={onClose}
            />
          </>
        }
      />
    );
  }

  if (preview) {
    return (
      <View style={styles.root}>
        <Zoomable>
          <Image source={preview} style={StyleSheet.absoluteFill} contentFit="contain" />
        </Zoomable>

        <View style={[styles.scrim, styles.scrimBottom]} pointerEvents="none" />

        {/* Side by side rather than stacked full-width blocks: the actions sit
            in one band at the bottom and the photograph stays visible, which
            is the thing being judged. */}
        <View style={[styles.previewActions, { bottom: insets.bottom + space[8] }]}>
          <Pressable
            onPress={() => void retake()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.retakeButton, pressed && styles.actionPressed]}
          >
            <Text style={styles.retakeLabel}>{t("camera.retake")}</Text>
          </Pressable>

          <Pressable
            onPress={() => void keep()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.keepButton, pressed && styles.actionPressed]}
          >
            <Text style={styles.keepLabel}>{t("camera.keep")}</Text>
          </Pressable>
        </View>
      </View>
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
          onPress={() => token && onOpenPhotos(token, participant?.event_title ?? "")}
          accessibilityLabel={t("gallery.open")}
          style={recent.length ? styles.stack : styles.chrome}
        >
          {recent.length ? (
            // Render oldest→newest so the newest photo sits on top. Each card
            // gets a fixed, slightly-off angle for a casual, hand-laid look.
            recent
              .slice(0, 3)
              .reverse()
              .map((uri, index, shown) => {
                const slot = CARD_SLOTS[CARD_SLOTS.length - shown.length + index];
                return (
                  <Image
                    key={uri}
                    source={uri}
                    style={[styles.card, { transform: slot }]}
                    contentFit="cover"
                    transition={120}
                  />
                );
              })
          ) : (
            <View style={styles.gridGlyph}>
              <View style={styles.gridCell} />
              <View style={styles.gridCell} />
              <View style={styles.gridCell} />
              <View style={styles.gridCell} />
            </View>
          )}
        </Pressable>
      </View>

      {flash ? <View style={styles.flash} pointerEvents="none" /> : null}
    </View>
  );
}

/**
 * A full-screen message on the dark camera surface.
 *
 * Same structure as every other screen: content breathing in the middle, the
 * actions pinned in the thumb zone rather than floating under the text.
 */
function Message({
  insets,
  title,
  body,
  actions,
}: {
  insets: { top: number; bottom: number };
  title: string;
  body: string;
  actions: React.ReactNode;
}) {
  return (
    <View style={styles.messageRoot}>
      <View
        style={[
          styles.messageBody,
          { paddingTop: insets.top + space[6], paddingBottom: space[6] },
        ]}
      >
        <Text style={styles.messageTitle}>{title}</Text>
        <Text style={styles.messageText}>{body}</Text>
      </View>
      <View style={[styles.messageActions, { paddingBottom: insets.bottom + space[6] }]}>
        {actions}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ink[900] },
  messageRoot: { flex: 1, backgroundColor: ink[900] },
  loadingCentre: { alignItems: "center", justifyContent: "center" },
  messageBody: {
    flex: 1,
    justifyContent: "center",
    gap: space[3],
    paddingHorizontal: space[6],
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  messageTitle: {
    fontFamily: ui.display.fontFamily,
    fontSize: 30,
    lineHeight: 38,
    color: paper[100],
  },
  // ink-500 on ink-900 is too faint to read comfortably at body size; the
  // paper scale is what this surface is meant to use.
  messageText: { fontSize: 17, lineHeight: 25, color: paper[300] },
  messageActions: {
    gap: space[2],
    paddingHorizontal: space[6],
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },

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
  // Once photos exist the button becomes a small fanned stack of the latest
  // three — a casual, hand-laid pile rather than a neat grid.
  stack: { width: 54, height: 48, alignItems: "center", justifyContent: "center" },
  card: {
    position: "absolute",
    top: 5,
    left: 8,
    width: 38,
    height: 38,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: paper[100],
    backgroundColor: ink[700],
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },

  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: paper[100], opacity: 0.15 },

  previewActions: {
    position: "absolute",
    left: space[6],
    right: space[6],
    flexDirection: "row",
    gap: space[3],
  },
  // Retake is a ghost over the photograph: available, never shouting.
  retakeButton: {
    flex: 1,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(247,243,237,0.35)",
    backgroundColor: "rgba(20,17,15,0.45)",
  },
  retakeLabel: { fontSize: 16, fontWeight: "500", color: paper[100] },
  // Keep is solid, and slightly wider — most photographs are kept.
  keepButton: {
    flex: 1.3,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: paper[100],
  },
  keepLabel: { fontSize: 16, fontWeight: "600", color: ink[900] },
  actionPressed: { opacity: 0.9 },
});
