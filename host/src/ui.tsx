/**
 * Shared host-app primitives.
 *
 * Every control is at least 44pt and works by tap — no hover-only affordances
 * (DESIGN.md §11). Light by default.
 */

import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { glow, ink, paper, radius, safelight, space } from "@luma/tokens";

import { useT } from "./i18n";

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor={ink[600]}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

export function Button({
  label,
  onPress,
  disabled,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "quiet" | "danger";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        variant === "quiet" && styles.buttonQuiet,
        variant === "danger" && styles.buttonDanger,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          variant === "quiet" && styles.buttonLabelQuiet,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A tappable choice. Used for themes, visibility, capture mode. */
export function Choice({
  label,
  description,
  selected,
  onPress,
  swatch,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  swatch?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceSelected,
        pressed && styles.buttonPressed,
      ]}
    >
      {swatch ? <View style={[styles.swatch, { backgroundColor: swatch }]} /> : null}
      <View style={styles.choiceText}>
        <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{label}</Text>
        {description ? <Text style={styles.hint}>{description}</Text> : null}
      </View>
      {/* Selection is not signalled by colour alone. */}
      <Text style={styles.choiceMark}>{selected ? "✓" : ""}</Text>
    </Pressable>
  );
}

export function Toggle({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      style={({ pressed }) => [
        styles.choice,
        value && styles.choiceSelected,
        disabled && styles.choiceDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <View style={styles.choiceText}>
        <Text style={[styles.choiceLabel, disabled && styles.muted]}>{label}</Text>
        {description ? <Text style={styles.hint}>{description}</Text> : null}
      </View>
      <Text style={styles.choiceMark}>{value ? t("toggle.on") : t("toggle.off")}</Text>
    </Pressable>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={styles.error}>{children}</Text>;
}

/** Fraunces for display, per DESIGN.md §5. Falls back to a system serif
 *  until the font finishes loading, so text never disappears. */
export const DISPLAY_FONT = "Fraunces_400Regular";

export const styles = StyleSheet.create({
  display: {
    fontFamily: DISPLAY_FONT,
    fontSize: 30,
    lineHeight: 38,
    color: ink[900],
  },
  displaySmall: {
    fontFamily: DISPLAY_FONT,
    fontSize: 22,
    lineHeight: 28,
    color: ink[900],
  },
  screen: {
    flex: 1,
    backgroundColor: paper[100],
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 1.2,
    color: ink[500],
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    color: ink[900],
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: ink[900],
  },
  muted: {
    color: ink[500],
  },
  field: {
    gap: space[2],
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: ink[500],
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: ink[500],
  },
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
    paddingHorizontal: space[6],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: ink[900],
  },
  buttonQuiet: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: paper[300],
  },
  buttonDanger: {
    backgroundColor: safelight,
  },
  buttonDisabled: {
    backgroundColor: paper[300],
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonLabel: {
    color: paper["000"],
    fontSize: 16,
    fontWeight: "500",
  },
  buttonLabelQuiet: {
    color: ink[900],
  },
  choice: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderWidth: 1,
    borderColor: paper[300],
    borderRadius: radius.control,
    backgroundColor: paper["000"],
  },
  choiceSelected: {
    borderColor: ink[900],
  },
  choiceDisabled: {
    opacity: 0.5,
  },
  choiceText: {
    flex: 1,
    gap: 2,
  },
  choiceLabel: {
    fontSize: 16,
    color: ink[900],
  },
  choiceLabelSelected: {
    fontWeight: "500",
  },
  choiceMark: {
    fontSize: 15,
    color: glow[700],
    minWidth: 28,
    textAlign: "right",
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: radius.photo,
  },
  error: {
    fontSize: 15,
    lineHeight: 22,
    color: safelight,
  },
});
