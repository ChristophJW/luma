/**
 * One event, from the host's side.
 *
 * "The live counter during an event is the host's favourite screen. Guests
 * joined, photos captured, updating live. Give it real design attention — it
 * is what they will screenshot." DESIGN.md §11.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { glow, ink, paper, radius, space } from "@luma/tokens";

import { ApiError, type LumaEvent, events } from "./api";
import { ConfirmDialog } from "./Confirm";
import { BackButton, PencilIcon, QrIcon } from "./Icons";
import { useI18n } from "./i18n";
import { Button, styles as ui } from "./ui";

const REFRESH_MS = 15_000;

export function EventDetail({
  token,
  event: initial,
  onEdit,
  onShowQr,
  onClose,
  onChanged,
  onTakePhotos,
}: {
  token: string;
  event: LumaEvent;
  onEdit: () => void;
  onShowQr: () => void;
  onClose: () => void;
  onChanged: () => void;
  onTakePhotos: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();

  const [event, setEvent] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which confirmation is open, if any.
  const [confirming, setConfirming] = useState<"publish" | "reveal" | null>(null);

  const refresh = useCallback(async () => {
    try {
      const fresh = await events.list(token);
      const match = fresh.find((candidate) => candidate.id === initial.id);
      if (match) setEvent(match);
    } catch {
      // A failed poll is not worth interrupting the screen for.
    }
  }, [token, initial.id]);

  // The counters are the point of this screen, so they keep themselves fresh
  // while a host is watching. A websocket comes later; polling is honest for
  // now and costs one small request. Refresh immediately on mount too — the
  // screen is entered with a copy of the event that is already stale (e.g. the
  // photo count right after coming back from the camera), and waiting a whole
  // interval to correct it reads as a broken counter.
  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function run(action: () => Promise<LumaEvent>) {
    setBusy(true);
    setError(null);
    setConfirming(null);
    try {
      setEvent(await action());
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("error.offline"));
    } finally {
      setBusy(false);
    }
  }

  const togglePublished = () =>
    run(() => events.publish(token, event.id, event.status === "draft"));

  const toggleRevealed = () => run(() => events.reveal(token, event.id, !event.is_revealed));

  /**
   * On native the host shoots inside the app; on web there is no native
   * camera to open, so the guest camera in a new tab is still the right
   * answer. Both paths use the same endpoints and the same shot accounting —
   * only the viewfinder differs.
   */
  function takePhotos() {
    if (Platform.OS === "web") {
      globalThis.open?.(event.join_url, "_blank");
    } else {
      onTakePhotos();
    }
  }

  const dateRange = formatRange(event, locale);
  const isDraft = event.status === "draft";
  // Without an end time there is no capture window, so there is nothing to
  // publish. Catching it here turns a 400 on a different screen into a
  // sentence that says what to do.
  const canPublish = Boolean(event.capture_ends_at);

  // "Published" and "guests can join" are different things. An event can be
  // live on paper while its capture window is still hours away, and a badge
  // that says Live in that state is a lie the host will act on.
  const statusKey = isDraft
    ? "status.draft"
    : event.is_revealed
      ? "status.revealed"
      : event.is_capture_open
      ? "status.live"
      : event.capture_ends_at && new Date(event.capture_ends_at) < new Date()
        ? "status.ended"
        : "status.scheduled";

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[12] },
      ]}
    >
      <View style={styles.content}>
        {/* The same control as the wizard. The label sits beside it rather
            than inside, so the target stays a clean 40pt ring and the text is
            free to be as long as German makes it. */}
        <View style={styles.backRow}>
          <BackButton onPress={onClose} accessibilityLabel={t("detail.back")} />
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.back}>{t("detail.back")}</Text>
          </Pressable>
        </View>

        <View style={styles.titleRow}>
          <Text style={ui.display}>{event.title}</Text>
          <Text style={[styles.badge, event.is_capture_open && styles.badgeLive]}>
            {t(statusKey as "status.draft")}
          </Text>
        </View>
        {event.location ? <Text style={styles.meta}>{event.location}</Text> : null}
        {dateRange ? <Text style={styles.meta}>{dateRange}</Text> : null}

        {/* The screenshot moment. */}
        <View style={styles.counters}>
          <Counter value={event.participant_count} label={t("events.joined")} />
          <Counter value={event.photo_count} label={t("events.photos")} accent />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Offering the camera for an event that cannot accept photos sends
            a host into a dead end and makes a closed window look like a
            broken camera. Say which it is, here, before they tap. */}
        {event.is_capture_open ? (
          <Button label={t("detail.takePhotos")} onPress={takePhotos} />
        ) : (
          <>
            <Button label={t("detail.takePhotos")} onPress={takePhotos} disabled />
            <Text style={styles.hint}>
              {t(
                event.capture_ends_at && new Date(event.capture_ends_at) < new Date()
                  ? "detail.captureClosed"
                  : "detail.captureNotYet",
              )}
            </Text>
          </>
        )}

        <View style={styles.actions}>
          <Action icon={<QrIcon />} label={t("events.qr")} onPress={onShowQr} />
          <Action icon={<PencilIcon />} label={t("events.edit")} onPress={onEdit} />
        </View>

        {isDraft && !canPublish ? (
          <>
            <Pressable
              onPress={onEdit}
              accessibilityRole="button"
              style={({ pressed }) => [styles.publish, pressed && styles.pressed]}
            >
              <Text style={styles.publishLabel}>{t("detail.addDate")}</Text>
            </Pressable>
            <Text style={styles.hint}>{t("detail.needsDate")}</Text>
          </>
        ) : (
          <>
            <Pressable
              onPress={() => setConfirming("publish")}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.publish, pressed && styles.pressed]}
            >
              {busy ? (
                <ActivityIndicator color={ink[500]} />
              ) : (
                <Text style={styles.publishLabel}>
                  {t(isDraft ? "detail.publish" : "detail.unpublish")}
                </Text>
              )}
            </Pressable>
            <Text style={styles.hint}>
              {t(isDraft ? "detail.publishHint" : "detail.unpublishHint")}
            </Text>
          </>
        )}

        {/* Revealing is only meaningful once the event is live — there is
            nothing to open while it is still a draft. */}
        {!isDraft ? (
          <>
            <Pressable
              onPress={() => setConfirming("reveal")}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.publish, pressed && styles.pressed]}
            >
              <Text style={styles.revealLabel}>
                {t(event.is_revealed ? "detail.unreveal" : "detail.reveal")}
              </Text>
            </Pressable>
            <Text style={styles.hint}>
              {t(event.is_revealed ? "detail.unrevealHint" : "detail.revealHint")}
            </Text>
          </>
        ) : null}

        <ConfirmDialog
          visible={confirming === "publish"}
          busy={busy}
          title={t(isDraft ? "confirm.publishTitle" : "confirm.unpublishTitle")}
          body={t(isDraft ? "confirm.publishBody" : "confirm.unpublishBody")}
          confirmLabel={t(isDraft ? "confirm.publishConfirm" : "confirm.unpublishConfirm")}
          onConfirm={togglePublished}
          onCancel={() => setConfirming(null)}
        />

        <ConfirmDialog
          visible={confirming === "reveal"}
          busy={busy}
          title={t(event.is_revealed ? "confirm.unrevealTitle" : "confirm.revealTitle")}
          body={t(event.is_revealed ? "confirm.unrevealBody" : "confirm.revealBody")}
          confirmLabel={t(
            event.is_revealed ? "confirm.unrevealConfirm" : "confirm.revealConfirm",
          )}
          onConfirm={toggleRevealed}
          onCancel={() => setConfirming(null)}
        />

        <View style={styles.summary}>
          <Row label={t("detail.theme")} value={t(`theme.${event.theme}` as "theme.noon")} />
          <Row
            label={t("guests.capacityLabel")}
            value={t("events.shotsAndGuests", {
              shots: event.shots_per_guest,
              guests: event.guest_capacity,
            })}
          />
          {event.involves_minors ? (
            <Row
              label={t("privacy.blurChildren")}
              value={t(event.blur_child_faces ? "detail.blurOn" : "detail.blurOff")}
            />
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

function Counter({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <View style={styles.counter}>
      <Text style={[styles.counterValue, accent && styles.counterAccent]}>{value}</Text>
      <Text style={styles.counterLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      {icon}
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function formatRange(event: LumaEvent, locale: string): string {
  if (!event.capture_starts_at) return "";
  const start = new Date(event.capture_starts_at);
  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatter.format(start);
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space[6] },
  content: { width: "100%", maxWidth: 520, alignSelf: "center", gap: space[3] },
  backRow: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 44 },
  back: { fontSize: 16, color: ink[500] },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space[3],
  },
  badge: { fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", color: ink[500] },
  badgeLive: { color: glow[700], fontWeight: "600" },
  meta: { fontSize: 15, color: ink[500] },

  counters: {
    flexDirection: "row",
    gap: space[3],
    marginTop: space[2],
  },
  counter: {
    flex: 1,
    padding: space[4],
    borderRadius: radius.card,
    backgroundColor: paper["000"],
    borderWidth: 1,
    borderColor: paper[300],
    gap: space[1],
  },
  counterValue: {
    fontSize: 40,
    lineHeight: 44,
    color: ink[900],
    fontVariant: ["tabular-nums"],
  },
  counterAccent: { color: glow[700] },
  counterLabel: { fontSize: 11, letterSpacing: 1.2, color: ink[500] },

  actions: { flexDirection: "row", gap: space[3] },
  action: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: paper[300],
    backgroundColor: paper["000"],
  },
  actionLabel: { fontSize: 15, color: ink[900] },
  pressed: { opacity: 0.9 },

  publish: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space[2],
  },
  publishLabel: { fontSize: 15, color: glow[700] },
  // The reveal is the moment the product exists for, so it reads as the
  // primary action here rather than another quiet link.
  revealLabel: { fontSize: 16, fontWeight: "600", color: glow[700] },
  hint: { fontSize: 13, lineHeight: 19, color: ink[500], textAlign: "center" },

  summary: {
    marginTop: space[4],
    borderTopWidth: 1,
    borderTopColor: paper[200],
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space[4],
    paddingVertical: space[3],
    borderBottomWidth: 1,
    borderBottomColor: paper[200],
  },
  rowLabel: { fontSize: 14, color: ink[500], flexShrink: 1 },
  rowValue: { fontSize: 14, color: ink[900], textAlign: "right", flexShrink: 1 },
  error: { fontSize: 15, color: "#C2413A" },
});
