/**
 * Scan an event's QR code to join as a guest. DESIGN.md §7 applies: dark, full
 * bleed, chrome floating over the feed, actions in the bottom quarter.
 *
 * Two ways in, because one is not always available. On a phone the camera
 * reads the QR directly. On the web — and in any in-app browser that hides the
 * camera — barcode scanning is not something expo-camera does, so the manual
 * code entry is the path, and it is always one tap away regardless.
 */

import { CameraView, useCameraPermissions } from "expo-camera";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { glow, ink, paper, radius, space } from "@luma/tokens";

import { useT } from "./i18n";
import { Button } from "./ui";

/**
 * Pull a join code out of whatever the QR encodes. The printed codes point at
 * the guest app — a `/join/CODE` URL or a `?code=CODE` one — but a bare code
 * typed by hand is just as valid. Mirrors the guest app's own parsing.
 */
export function parseJoinCode(raw: string): string | null {
  const value = raw.trim();
  const query = value.match(/[?&]code=([A-Za-z0-9]+)/);
  if (query) return query[1].toUpperCase();
  const path = value.match(/\/join\/([A-Za-z0-9]+)/);
  if (path) return path[1].toUpperCase();
  if (/^[A-Za-z0-9]{4,12}$/.test(value)) return value.toUpperCase();
  return null;
}

export function ScanScreen({
  onCode,
  onClose,
}: {
  onCode: (joinCode: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();

  // The camera cannot scan on web, so start there in manual entry rather than
  // showing a viewfinder that will never fire.
  const [manual, setManual] = useState(Platform.OS === "web");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  // A QR in frame fires onBarcodeScanned many times a second. Lock after the
  // first accepted read so a valid code is handed up exactly once.
  const handled = useRef(false);

  const accept = useCallback(
    (raw: string) => {
      const parsed = parseJoinCode(raw);
      if (!parsed) {
        setError(t("scan.invalid"));
        return false;
      }
      onCode(parsed);
      return true;
    },
    [onCode, t],
  );

  const onBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (handled.current) return;
      if (accept(data)) handled.current = true;
    },
    [accept],
  );

  if (manual) {
    return (
      <View style={styles.messageRoot}>
        <View
          style={[
            styles.messageBody,
            { paddingTop: insets.top + space[6], paddingBottom: space[6] },
          ]}
        >
          <Text style={styles.title}>{t("scan.manualTitle")}</Text>
          <Text style={styles.body}>{t("scan.manualBody")}</Text>

          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(value) => {
              setCode(value.replace(/[^A-Za-z0-9]/g, "").toUpperCase());
              setError(null);
            }}
            placeholder={t("scan.codePlaceholder")}
            placeholderTextColor="rgba(247,243,237,0.4)"
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={() => code && accept(code)}
            accessibilityLabel={t("scan.codeLabel")}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={[styles.messageActions, { paddingBottom: insets.bottom + space[6] }]}>
          <Button
            label={t("scan.join")}
            tone="dark"
            disabled={!code}
            onPress={() => accept(code)}
          />
          {Platform.OS !== "web" ? (
            <Button
              label={t("scan.useCamera")}
              variant="quiet"
              tone="dark"
              onPress={() => {
                setManual(false);
                setError(null);
              }}
            />
          ) : null}
          <Button label={t("wizard.cancel")} variant="quiet" tone="dark" onPress={onClose} />
        </View>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={[styles.messageRoot, styles.loadingCentre]}>
        <ActivityIndicator color={paper[100]} />
      </View>
    );
  }

  if (!permission.granted) {
    const blocked = permission.canAskAgain === false;
    return (
      <View style={styles.messageRoot}>
        <View
          style={[
            styles.messageBody,
            { paddingTop: insets.top + space[6], paddingBottom: space[6] },
          ]}
        >
          <Text style={styles.title}>
            {t(blocked ? "camera.permissionBlockedHeading" : "camera.permissionHeading")}
          </Text>
          <Text style={styles.body}>{t("scan.permissionBody")}</Text>
        </View>
        <View style={[styles.messageActions, { paddingBottom: insets.bottom + space[6] }]}>
          <Button
            label={t(blocked ? "camera.openSettings" : "camera.allow")}
            tone="dark"
            onPress={() =>
              blocked ? void Linking.openSettings() : void requestPermission()
            }
          />
          <Button
            label={t("scan.enterInstead")}
            variant="quiet"
            tone="dark"
            onPress={() => setManual(true)}
          />
          <Button label={t("wizard.cancel")} variant="quiet" tone="dark" onPress={onClose} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={onBarcodeScanned}
      />

      {/* Scrims so the chrome survives the lens pointing at anything. */}
      <View style={[styles.scrim, styles.scrimTop]} pointerEvents="none" />
      <View style={[styles.scrim, styles.scrimBottom]} pointerEvents="none" />

      <View style={[styles.hudTop, { top: insets.top + space[3] }]}>
        <Pressable onPress={onClose} accessibilityLabel={t("wizard.cancel")} style={styles.chrome}>
          <Text style={styles.chromeGlyph}>✕</Text>
        </Pressable>
      </View>

      {/* A framing reticle: four corners, nothing in the middle to obscure the
          code the lens is trying to read. */}
      <View style={styles.reticleWrap} pointerEvents="none">
        <View style={styles.reticle}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <Text style={styles.hint}>{t("scan.hint")}</Text>
      </View>

      <View style={[styles.actions, { bottom: insets.bottom + space[8] }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={t("scan.enterInstead")}
          variant="quiet"
          tone="dark"
          onPress={() => setManual(true)}
        />
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
  messageActions: {
    gap: space[2],
    paddingHorizontal: space[6],
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  title: { fontSize: 30, lineHeight: 38, color: paper[100] },
  body: { fontSize: 17, lineHeight: 25, color: paper[300] },
  input: {
    minHeight: 56,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderWidth: 1,
    borderColor: "rgba(247,243,237,0.35)",
    borderRadius: radius.control,
    backgroundColor: "rgba(20,17,15,0.45)",
    fontSize: 24,
    letterSpacing: 4,
    textAlign: "center",
    color: paper[100],
    fontVariant: ["tabular-nums"],
    marginTop: space[2],
  },
  error: { fontSize: 15, lineHeight: 22, color: glow[400], textAlign: "center" },

  scrim: { position: "absolute", left: 0, right: 0, height: 140 },
  scrimTop: { top: 0, backgroundColor: "rgba(20,17,15,0.55)" },
  scrimBottom: { bottom: 0, backgroundColor: "rgba(20,17,15,0.55)" },

  hudTop: {
    position: "absolute",
    left: space[4],
    right: space[4],
    flexDirection: "row",
    alignItems: "center",
  },
  chrome: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20,17,15,0.45)",
  },
  chromeGlyph: { color: paper[100], fontSize: 18 },

  reticleWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: space[4] },
  reticle: { width: 240, height: 240 },
  corner: {
    position: "absolute",
    width: 36,
    height: 36,
    borderColor: paper[100],
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  hint: {
    fontSize: 15,
    color: paper[100],
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radius.pill,
    backgroundColor: "rgba(20,17,15,0.55)",
    overflow: "hidden",
  },

  actions: {
    position: "absolute",
    left: space[6],
    right: space[6],
    gap: space[2],
  },
});
