/**
 * The shared album: every photograph in the event, from every guest, once the
 * host has opened it. DESIGN.md §8 — the wall of images is the point, edge to
 * edge with 2px gutters.
 *
 * This is the read-only sibling of PhotosScreen. There is no selection and no
 * delete: these are other people's photographs as much as the host's, so the
 * host looks but does not reach in. The one thing it adds is attribution —
 * who took each photo — shown in the lightbox.
 */

import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Directions, Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { runOnJS } from "react-native-reanimated";

import { glow, ink, paper, radius, space } from "@luma/tokens";

import { ApiError, type AlbumPhoto, events } from "./api";
import { BackButton } from "./Icons";
import { useT } from "./i18n";
import { styles as ui } from "./ui";
import { Zoomable } from "./Zoomable";

const COLUMNS = 3;
const GUTTER = 2;

type Sort = "time" | "name";

/** Sort a copy — never the state array in place. "time" is newest-first;
 *  "name" groups by photographer, newest-first within each name. */
function sortPhotos(photos: AlbumPhoto[], sort: Sort): AlbumPhoto[] {
  const byTime = (a: AlbumPhoto, b: AlbumPhoto) => b.created_at.localeCompare(a.created_at);
  if (sort === "time") return [...photos].sort(byTime);
  return [...photos].sort(
    (a, b) => a.photographer.localeCompare(b.photographer) || byTime(a, b),
  );
}

export function AlbumScreen({
  token,
  eventId,
  title,
  onClose,
}: {
  /** The host's account token — the album is an owner-only, reveal-gated view. */
  token: string;
  eventId: string;
  title: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();

  const [photos, setPhotos] = useState<AlbumPhoto[] | null>(null);
  const [sort, setSort] = useState<Sort>("time");
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sorting is client-side: the album is already fully loaded, so reordering
  // is instant and needs no round trip. The lightbox indexes into this same
  // ordered list, so stepping matches what the grid shows.
  const ordered = useMemo(() => sortPhotos(photos ?? [], sort), [photos, sort]);
  // While a photograph is zoomed, edge taps must pan it rather than step on.
  const [zoomed, setZoomed] = useState(false);

  // Measured, not assumed — see the note in PhotosScreen.
  const [gridWidth, setGridWidth] = useState(0);
  const tile = gridWidth > 0 ? Math.floor((gridWidth - GUTTER * (COLUMNS - 1)) / COLUMNS) : 0;

  useEffect(() => {
    let cancelled = false;
    events
      .album(token, eventId)
      .then((list) => {
        if (!cancelled) setPhotos(list);
      })
      .catch((caught) => {
        if (cancelled) return;
        // 409 is the reveal gate. The entry point only appears once revealed,
        // so this is a backstop — say so plainly rather than showing nothing.
        if (caught instanceof ApiError && caught.status === 409) {
          setError(t("album.notOpen"));
        }
        setPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, eventId, t]);

  const current = open !== null ? ordered[open] ?? null : null;

  // Step through the album. A functional update so a fling never reads a stale
  // index, and clamped so the two ends simply hold.
  const step = (delta: number) => {
    setZoomed(false);
    setOpen((cur) => {
      if (cur === null) return cur;
      const target = cur + delta;
      return target >= 0 && target < ordered.length ? target : cur;
    });
  };

  // Swipe left/right for next/previous — the gesture people reach for first.
  // A fling (a quick flick) rather than a pan, so it never fights pinch-zoom,
  // and disabled while zoomed, where a drag must pan the photograph instead.
  const swipe = Gesture.Race(
    Gesture.Fling()
      .direction(Directions.LEFT)
      .enabled(!zoomed)
      .onStart(() => {
        "worklet";
        runOnJS(step)(1);
      }),
    Gesture.Fling()
      .direction(Directions.RIGHT)
      .enabled(!zoomed)
      .onStart(() => {
        "worklet";
        runOnJS(step)(-1);
      }),
  );

  return (
    <View style={styles.root}>
      <View style={[styles.head, { paddingTop: insets.top + space[4] }]}>
        <BackButton onPress={onClose} accessibilityLabel={t("gallery.back")} tone="dark" />
        <View style={styles.headText}>
          <Text style={styles.eyebrow} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[ui.displaySmall, styles.onDark]}>{t("album.title")}</Text>
        </View>
        {photos ? <Text style={styles.count}>{photos.length}</Text> : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {photos === null ? (
        <ActivityIndicator color={ink[500]} style={styles.loading} />
      ) : photos.length === 0 ? (
        <Text style={styles.empty}>{error ? t("album.notOpen") : t("album.empty")}</Text>
      ) : (
        <>
          {/* Two ways to read the wall: as it happened, or grouped by who took
              it. Segmented, so the current order is always visible. */}
          <View style={styles.sortRow}>
            <SortTab label={t("album.sortTime")} active={sort === "time"} onPress={() => setSort("time")} />
            <SortTab label={t("album.sortName")} active={sort === "name"} onPress={() => setSort("name")} />
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space[8] }}>
            <View
              style={styles.grid}
              onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
            >
              {tile > 0
                ? ordered.map((photo, index) => (
                    <Pressable
                      key={photo.id}
                      onPress={() => setOpen(index)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        photo.photographer
                          ? `${t("gallery.openPhoto", { index: index + 1 })}, ${t("album.by", { name: photo.photographer })}`
                          : t("gallery.openPhoto", { index: index + 1 })
                      }
                      style={{ width: tile, height: tile }}
                    >
                      <Image
                        source={photo.url}
                        style={styles.tile}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={400}
                        recyclingKey={photo.id}
                      />
                      {photo.photographer ? (
                        <View style={styles.caption} pointerEvents="none">
                          <Text style={styles.captionText} numberOfLines={1}>
                            {photo.photographer}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  ))
                : null}
            </View>
          </ScrollView>
        </>
      )}

      <Modal visible={current !== null} transparent={false} animationType="fade">
        {current ? (
          <GestureDetector gesture={swipe}>
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
                onPress={() => setOpen(null)}
                accessibilityLabel={t("gallery.close")}
                style={styles.chrome}
              >
                <Text style={styles.chromeGlyph}>✕</Text>
              </Pressable>
              <Text style={styles.position}>
                {t("gallery.position", { position: open! + 1, total: ordered.length })}
              </Text>
            </View>

            {!zoomed && open! > 0 ? (
              <Pressable
                onPress={() => step(-1)}
                accessibilityLabel={t("gallery.previous")}
                style={[styles.step, styles.stepPrev]}
              />
            ) : null}
            {!zoomed && open! < ordered.length - 1 ? (
              <Pressable
                onPress={() => step(1)}
                accessibilityLabel={t("gallery.next")}
                style={[styles.step, styles.stepNext]}
              />
            ) : null}

            {current.photographer ? (
              <View style={[styles.lightboxBottom, { bottom: insets.bottom + space[8] }]}>
                <Text style={styles.by}>{t("album.by", { name: current.photographer })}</Text>
              </View>
            ) : null}
          </View>
          </GestureDetector>
        ) : null}
      </Modal>
    </View>
  );
}

function SortTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.sortTab,
        active && styles.sortTabActive,
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text style={[styles.sortTabLabel, active && styles.sortTabLabelActive]}>{label}</Text>
    </Pressable>
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

  sortRow: {
    flexDirection: "row",
    gap: space[2],
    paddingHorizontal: space[4],
    paddingBottom: space[3],
  },
  sortTab: {
    minHeight: 36,
    paddingHorizontal: space[4],
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: ink[700],
  },
  sortTabActive: { backgroundColor: paper[100], borderColor: paper[100] },
  sortTabLabel: { fontSize: 14, color: paper[300] },
  sortTabLabelActive: { color: ink[900], fontWeight: "600" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: GUTTER },
  tile: { width: "100%", height: "100%", backgroundColor: ink[800] },
  // A name band along the bottom of each tile, readable over any photo.
  caption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space[2],
    paddingVertical: 3,
    backgroundColor: "rgba(20,17,15,0.5)",
  },
  captionText: { fontSize: 11, color: paper[100] },

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
  by: {
    fontSize: 15,
    color: paper[100],
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radius.pill,
    backgroundColor: "rgba(20,17,15,0.55)",
    overflow: "hidden",
  },

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
});
