/**
 * The join QR for one event.
 *
 * The image is rendered by the API rather than in JavaScript, so the code a
 * host sees here is byte-identical to the one on the printed signs and table
 * cards (CHECKLIST.md §6). One source, no drift.
 */

import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ink, paper, radius, space } from "@luma/tokens";

import { API_BASE, type LumaEvent } from "./api";
import { useT } from "./i18n";
import { Button, styles as ui } from "./ui";

export function QrScreen({ event, onClose }: { event: LumaEvent; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const t = useT();

  const source = `${API_BASE}/api/events/by-code/${event.join_code}/qr.png?size=10`;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] },
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.eyebrow}>{event.title.toUpperCase()}</Text>
        <Text style={ui.display}>{t("qr.heading")}</Text>
        <Text style={styles.lede}>{t("qr.lede")}</Text>

        <View style={styles.card}>
          <Image
            source={{ uri: source }}
            style={styles.qr}
            resizeMode="contain"
            accessibilityLabel={t("events.qr")}
          />
          {/* The code is the fallback when a camera will not focus, so it is
              set large and in tabular figures. */}
          <Text style={styles.code} selectable>
            {event.join_code}
          </Text>
          <Text style={styles.hint}>
            {t("qr.orEnter", { url: event.join_url.replace(/^https?:\/\//, "").split("/join")[0] })}
          </Text>
        </View>

        <Pressable
          onPress={() => undefined}
          accessibilityRole="link"
          accessibilityLabel={event.join_url}
          style={styles.urlBox}
        >
          <Text style={styles.url} selectable numberOfLines={1}>
            {event.join_url}
          </Text>
        </Pressable>

        <Button label={t("qr.done")} onPress={onClose} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space[6] },
  content: { width: "100%", maxWidth: 460, alignSelf: "center", gap: space[4] },
  eyebrow: { fontSize: 13, fontWeight: "500", letterSpacing: 1.2, color: ink[500] },
  lede: { fontSize: 15, lineHeight: 22, color: ink[500] },
  card: {
    alignItems: "center",
    gap: space[3],
    padding: space[6],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: paper[300],
    backgroundColor: paper["000"],
  },
  qr: { width: 240, height: 240 },
  code: {
    fontSize: 34,
    letterSpacing: 6,
    color: ink[900],
    fontVariant: ["tabular-nums"],
  },
  hint: { fontSize: 13, color: ink[500], textAlign: "center" },
  urlBox: {
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.control,
    backgroundColor: paper[200],
  },
  url: { fontSize: 14, color: ink[500] },
});
