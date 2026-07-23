/**
 * A confirmation step for consequential actions.
 *
 * Built rather than using RN's `Alert`, which is unreliable on the web target
 * and looks like the operating system rather than like Luma. Publishing is
 * not destructive, so this is a plain confirm — the typed confirmation from
 * DESIGN.md §11 is reserved for things that destroy photographs.
 */

import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { ink, paper, radius, safelight, space } from "@luma/tokens";

import { useT } from "./i18n";
import { styles as ui } from "./ui";

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  destructive,
  busy,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      {/* Tapping the scrim cancels — the safe direction. */}
      <Pressable style={styles.scrim} onPress={onCancel} accessibilityLabel={t("confirm.cancel")}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={ui.displaySmall}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          <View style={styles.actions}>
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                destructive && styles.buttonDestructive,
                busy && styles.buttonBusy,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.buttonLabel}>{confirmLabel}</Text>
            </Pressable>

            {/* Cancel carries the same visual weight as confirm. */}
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, styles.buttonQuiet, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonLabel, styles.buttonLabelQuiet]}>
                {t("confirm.cancel")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(20, 17, 15, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: space[6],
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    gap: space[3],
    padding: space[6],
    borderRadius: radius.card,
    backgroundColor: paper["000"],
  },
  body: { fontSize: 15, lineHeight: 22, color: ink[500] },
  actions: { gap: space[2], marginTop: space[2] },
  button: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: ink[900],
  },
  buttonDestructive: { backgroundColor: safelight },
  buttonQuiet: { backgroundColor: "transparent", borderWidth: 1, borderColor: paper[300] },
  buttonBusy: { opacity: 0.6 },
  buttonLabel: { fontSize: 16, fontWeight: "500", color: paper["000"] },
  buttonLabelQuiet: { color: ink[900] },
  pressed: { opacity: 0.9 },
});
