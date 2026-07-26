/**
 * The Luma lockup — the brand mark beside the wordmark.
 *
 * Deliberately no SVG runtime (see Icons.tsx): the mark is a small PNG and the
 * word is set in the display face we already load (Fraunces, DESIGN.md §5). At
 * these sizes an Image is crisp and weighs nothing next to a vector runtime.
 */

import { Image, StyleSheet, Text, View } from "react-native";

import { ink } from "@luma/tokens";

import { DISPLAY_FONT } from "./ui";

const MARK = require("../assets/luma-mark.png");

export function Wordmark({
  size = 22,
  color = ink[900],
}: {
  /** Cap height of the wordmark, in points. The mark scales with it. */
  size?: number;
  color?: string;
}) {
  return (
    <View
      style={styles.row}
      accessibilityRole="header"
      accessibilityLabel="Luma"
    >
      <Image
        source={MARK}
        style={{ width: size * 1.02, height: size * 1.02 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <Text
        style={[
          styles.word,
          { fontSize: size * 1.32, color, lineHeight: size * 1.32 },
        ]}
        allowFontScaling={false}
      >
        Luma
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  word: { fontFamily: DISPLAY_FONT, letterSpacing: -0.2, includeFontPadding: false },
});
