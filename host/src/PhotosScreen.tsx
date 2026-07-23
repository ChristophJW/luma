/**
 * The host's own photographs from an event: grid, fullscreen, delete.
 *
 * Photographs sit edge to edge at radius 0 with 2px gutters — the wall of
 * images is the point, and a photograph's own edge is its frame (DESIGN.md §8).
 *
 * A long press enters selection mode. That keeps the plain tap free for the
 * thing people do far more often — look at a photograph — and matches the
 * gesture every phone photo app already taught them.
 */

import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { glow, ink, paper, radius, space } from "@luma/tokens";

import { ConfirmDialog } from "./Confirm";
import { BackButton } from "./Icons";
import { type Photo, capture } from "./capture/api";
import { useT } from "./i18n";
import { Button, styles as ui } from "./ui";
import { Zoomable } from "./Zoomable";

const COLUMNS = 3;
const GUTTER = 2;

export function PhotosScreen({
  token,
  title,
  onClose,
}: {
  token: string;
  title: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();

  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<"one" | "many" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** null = browsing. A Set (possibly empty) = selection mode. */
  const [selected, setSelected] = useState<Set<string> | null>(null);
  // While a photograph is zoomed, edge taps must pan it rather than step
  // to the next one.
  const [zoomed, setZoomed] = useState(false);

  // Measured, not assumed. `Dimensions.get("window")` ignores safe-area
  // insets, split view and rotation, and a grid a few points wider than its
  // container wraps the last tile onto its own row.
  const [gridWidth, setGridWidth] = useState(0);

  // Floored, because React Native rounds each tile to device pixels. Three
  // tiles of 129.67 plus two gutters overflows a 393pt row by a fraction —
  // enough to wrap. Flooring guarantees the row fits; the leftover (at most
  // COLUMNS - 1 points) falls at the trailing edge where nobody sees it.
  const tile =
    gridWidth > 0 ? Math.floor((gridWidth - GUTTER * (COLUMNS - 1)) / COLUMNS) : 0;

  useEffect(() => {
    capture
      .photos(token)
      .then(setPhotos)
      .catch(() => setPhotos([]));
  }, [token]);

  const selecting = selected !== null;
  const selectedCount = selected?.size ?? 0;

  function startSelecting(id: string) {
    // A long press has no other confirmation that it registered, so it gets a
    // tap of haptic feedback.
    Vibration.vibrate(12);
    setSelected(new Set([id]));
  }

  function toggle(id: string) {
    setSelected((current) => {
      if (!current) return current;
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteMany(ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);

    const failed = new Set<string>();
    for (const id of ids) {
      try {
        await capture.deletePhoto(token, id);
      } catch {
        failed.add(id);
      }
    }

    // Only what actually went is removed. A partial failure must not leave
    // the screen claiming more than happened.
    setPhotos((current) =>
      (current ?? []).filter((photo) => !ids.includes(photo.id) || failed.has(photo.id)),
    );
    if (failed.size) setError(t("gallery.deleteFailed", { count: failed.size }));

    setConfirming(null);
    setSelected(null);
    setOpen(null);
    setBusy(false);
  }

  const current = open !== null && photos ? photos[open] : null;

  return (
    <View style={styles.root}>
      <View style={[styles.head, { paddingTop: insets.top + space[4] }]}>
        {selecting ? (
          <>
            <Pressable
              onPress={() => setSelected(null)}
              accessibilityRole="button"
              hitSlop={8}
              style={styles.headAction}
            >
              <Text style={styles.headActionLabel}>{t("wizard.cancel")}</Text>
            </Pressable>
            <View style={styles.headText}>
              <Text style={[ui.displaySmall, styles.onDark]}>
                {t("gallery.selected", { count: selectedCount })}
              </Text>
            </View>
          </>
        ) : (
          <>
            <BackButton onPress={onClose} accessibilityLabel={t("gallery.back")} tone="dark" />
            <View style={styles.headText}>
              <Text style={styles.eyebrow} numberOfLines={1}>
                {title}
              </Text>
              <Text style={[ui.displaySmall, styles.onDark]}>{t("gallery.open")}</Text>
            </View>
            {photos ? <Text style={styles.count}>{photos.length}</Text> : null}
          </>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {photos === null ? (
        <ActivityIndicator color={ink[500]} style={styles.loading} />
      ) : photos.length === 0 ? (
        <Text style={styles.empty}>{t("gallery.empty")}</Text>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + (selecting ? space[24] : space[8]),
          }}
        >
          <View
            style={styles.grid}
            onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
          >
            {tile > 0
              ? photos.map((photo, index) => {
                  const isSelected = selected?.has(photo.id) ?? false;
                  return (
                    <Pressable
                      key={photo.id}
                      onPress={() => (selecting ? toggle(photo.id) : setOpen(index))}
                      onLongPress={() => startSelecting(photo.id)}
                      delayLongPress={350}
                      accessibilityRole={selecting ? "checkbox" : "button"}
                      accessibilityState={selecting ? { checked: isSelected } : undefined}
                      accessibilityLabel={t("gallery.openPhoto", { index: index + 1 })}
                      style={{ width: tile, height: tile }}
                    >
                      <Image
                        source={photo.url}
                        style={styles.tile}
                        contentFit="cover"
                        // Stable URLs (the server caches the signature) make
                        // this a real cache rather than a permanent miss.
                        cachePolicy="memory-disk"
                        // Photographs resolve out of the dark rather than
                        // popping in. DESIGN.md §6 — 400ms, no bounce.
                        transition={400}
                        recyclingKey={photo.id}
                      />
                      {isSelected ? (
                        <>
                          {/* Never colour alone: the tile dims, gains a ring,
                              and carries a tick. */}
                          <View style={styles.selectedVeil} />
                          <View style={styles.tick}>
                            <Text style={styles.tickGlyph}>✓</Text>
                          </View>
                        </>
                      ) : null}
                    </Pressable>
                  );
                })
              : null}
          </View>
        </ScrollView>
      )}

      {/* Selection actions sit at the bottom, in reach of a thumb. */}
      {selecting ? (
        <View style={[styles.selectionBar, { paddingBottom: insets.bottom + space[4] }]}>
          <Button
            label={t("gallery.deleteSelected", { count: selectedCount })}
            variant="danger"
            disabled={selectedCount === 0 || busy}
            onPress={() => setConfirming("many")}
          />
        </View>
      ) : null}

      <Modal visible={current !== null} transparent={false} animationType="fade">
        {current ? (
          <View style={styles.lightbox}>
            <Zoomable onZoomedChange={setZoomed}>
              <Image
                source={current.url}
                style={styles.full}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={240}
                recyclingKey={current.id}
              />
            </Zoomable>

            <View style={[styles.lightboxTop, { top: insets.top + space[3] }]}>
              <Pressable
                onPress={() => {
                  setOpen(null);
                  setConfirming(null);
                }}
                accessibilityLabel={t("gallery.close")}
                style={styles.chrome}
              >
                <Text style={styles.chromeGlyph}>✕</Text>
              </Pressable>
              <Text style={styles.position}>
                {t("gallery.position", { position: open! + 1, total: photos!.length })}
              </Text>
            </View>

            {/* Wide invisible targets down each edge: a thumb finds them
                without looking, and they never cover the photograph. */}
            {!zoomed && open! > 0 ? (
              <Pressable
                onPress={() => {
                  setZoomed(false);
                  setOpen(open! - 1);
                }}
                accessibilityLabel={t("gallery.previous")}
                style={[styles.step, styles.stepPrev]}
              />
            ) : null}
            {!zoomed && open! < photos!.length - 1 ? (
              <Pressable
                onPress={() => {
                  setZoomed(false);
                  setOpen(open! + 1);
                }}
                accessibilityLabel={t("gallery.next")}
                style={[styles.step, styles.stepNext]}
              />
            ) : null}

            <View style={[styles.lightboxBottom, { bottom: insets.bottom + space[8] }]}>
              <Pressable onPress={() => setConfirming("one")} style={styles.ghost}>
                <Text style={styles.ghostLabel}>{t("gallery.delete")}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Modal>

      <ConfirmDialog
        visible={confirming !== null}
        busy={busy}
        destructive
        title={
          confirming === "many"
            ? t("gallery.deleteSelected", { count: selectedCount })
            : t("gallery.deleteConfirm")
        }
        body={t("gallery.deleteWarning")}
        confirmLabel={t("gallery.deleteConfirm")}
        onConfirm={() =>
          void deleteMany(
            confirming === "many" ? [...(selected ?? [])] : current ? [current.id] : [],
          )
        }
        onCancel={() => setConfirming(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ink[900] },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingBottom: space[4],
  },
  headText: { flex: 1, minWidth: 0 },
  headAction: { minHeight: 40, justifyContent: "center" },
  headActionLabel: { fontSize: 16, color: glow[400] },
  onDark: { color: paper[100] },
  eyebrow: { fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: ink[500] },
  count: { fontSize: 22, color: glow[400], fontVariant: ["tabular-nums"] },
  loading: { marginTop: space[16] },
  empty: {
    fontSize: 16,
    lineHeight: 24,
    color: ink[500],
    textAlign: "center",
    padding: space[16],
  },
  error: {
    fontSize: 15,
    color: "#C2413A",
    paddingHorizontal: space[4],
    paddingBottom: space[3],
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: GUTTER },
  tile: { width: "100%", height: "100%", backgroundColor: ink[800] },
  selectedVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20,17,15,0.5)",
    borderWidth: 2,
    borderColor: glow[400],
  },
  tick: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: glow[400],
    alignItems: "center",
    justifyContent: "center",
  },
  tickGlyph: { fontSize: 13, fontWeight: "700", color: ink[900] },

  selectionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space[6],
    paddingTop: space[4],
    backgroundColor: ink[900],
    borderTopWidth: 1,
    borderTopColor: ink[700],
  },

  lightbox: { flex: 1, backgroundColor: ink[900], justifyContent: "center" },
  full: { width: "100%", height: "100%" },
  lightboxTop: {
    position: "absolute",
    left: space[4],
    right: space[4],
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
  },
  position: { fontSize: 15, color: paper[100], fontVariant: ["tabular-nums"] },
  lightboxBottom: { position: "absolute", left: space[6], right: space[6], alignItems: "center" },

  step: { position: "absolute", top: "18%", bottom: "18%", width: "24%" },
  stepPrev: { left: 0 },
  stepNext: { right: 0 },

  chrome: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20,17,15,0.45)",
  },
  chromeGlyph: { color: paper[100], fontSize: 20 },

  // Readable over a photograph, but never the loudest thing on screen.
  ghost: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: space[6],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(247,243,237,0.25)",
    backgroundColor: "rgba(20,17,15,0.45)",
  },
  ghostLabel: { color: paper[100], fontSize: 15 },
});
