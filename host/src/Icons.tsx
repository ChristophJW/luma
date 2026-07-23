/**
 * Icons drawn from primitives.
 *
 * No icon library and no SVG dependency: these are two small shapes, they
 * take their colour from the token palette, and they render identically on
 * native and web. A font or an SVG runtime would be more weight and one more
 * thing to keep in sync with the palette.
 */

import { Pressable, StyleSheet, View } from "react-native";

import { glow, ink, paper } from "@luma/tokens";

interface IconProps {
  color?: string;
  size?: number;
}

export function CalendarIcon({ color = ink[500], size = 18 }: IconProps) {
  const ring = Math.max(2, Math.round(size / 9));

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {/* hanging rings */}
      <View style={[styles.row, { height: ring, paddingHorizontal: size * 0.22 }]}>
        <View style={{ width: ring, height: ring, backgroundColor: color }} />
        <View style={{ width: ring, height: ring, backgroundColor: color }} />
      </View>
      <View
        style={{
          flex: 1,
          borderWidth: 1.5,
          borderColor: color,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        {/* header band */}
        <View style={{ height: size * 0.22, backgroundColor: color }} />
      </View>
    </View>
  );
}

export function ClockIcon({ color = ink[500], size = 18 }: IconProps) {
  const centre = size / 2;

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: color,
        }}
      />
      {/* hour hand, pointing up */}
      <View
        style={{
          position: "absolute",
          left: centre - 0.75,
          top: size * 0.26,
          width: 1.5,
          height: centre - size * 0.26,
          backgroundColor: color,
        }}
      />
      {/* minute hand, pointing right */}
      <View
        style={{
          position: "absolute",
          left: centre,
          top: centre - 0.75,
          width: size * 0.24,
          height: 1.5,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export function PencilIcon({ color = ink[900], size = 18 }: IconProps) {
  const width = size * 0.34;

  return (
    <View
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
      pointerEvents="none"
    >
      {/* Built upright, then rotated — far easier to reason about than
          positioning each part along a diagonal. */}
      <View style={{ transform: [{ rotate: "45deg" }], alignItems: "center" }}>
        <View
          style={{
            width,
            height: size * 0.16,
            backgroundColor: color,
            borderTopLeftRadius: 2,
            borderTopRightRadius: 2,
          }}
        />
        <View
          style={{
            width,
            height: size * 0.4,
            borderLeftWidth: 1.5,
            borderRightWidth: 1.5,
            borderColor: color,
          }}
        />
        {/* graphite tip */}
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: width / 2,
            borderRightWidth: width / 2,
            borderTopWidth: size * 0.2,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderTopColor: color,
          }}
        />
      </View>
    </View>
  );
}

/** A stylised QR: three finder squares plus a scattering of modules. */
export function QrIcon({ color = ink[900], size = 18 }: IconProps) {
  const cell = size / 5;
  const finder = cell * 1.8;

  const Finder = ({ top, left }: { top: number; left: number }) => (
    <View
      style={{
        position: "absolute",
        top,
        left,
        width: finder,
        height: finder,
        borderWidth: 1.5,
        borderColor: color,
        borderRadius: 1,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={{ width: finder * 0.32, height: finder * 0.32, backgroundColor: color }} />
    </View>
  );

  const Dot = ({ top, left }: { top: number; left: number }) => (
    <View
      style={{ position: "absolute", top, left, width: cell * 0.7, height: cell * 0.7, backgroundColor: color }}
    />
  );

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Finder top={0} left={0} />
      <Finder top={0} left={size - finder} />
      <Finder top={size - finder} left={0} />
      <Dot top={size - cell * 1.6} left={size - cell * 1.6} />
      <Dot top={size - cell * 0.8} left={size - cell * 0.8} />
      <Dot top={size - cell * 1.6} left={size - cell * 0.8} />
    </View>
  );
}

/**
 * The back control.
 *
 * Shared rather than duplicated: the chevron's geometry carries several
 * optical corrections that are easy to get subtly wrong, and two copies would
 * drift the moment either is touched.
 *
 * The mark is drawn, not typeset. A "‹" glyph carries its own sidebearings
 * and baseline, so it never sits in the optical centre of a circle. Two
 * round-capped bars meeting at 90° are symmetric about the box by
 * construction, and round ends match the pill radius of the ring.
 */
export function BackButton({
  onPress,
  accessibilityLabel,
  tone = "light",
}: {
  onPress: () => void;
  accessibilityLabel: string;
  /** `dark` for the ink-900 surfaces — the camera and the gallery. */
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  const line = dark ? glow[400] : glow[600];
  const linePressed = dark ? paper[100] : glow[700];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [
        back.ring,
        {
          borderColor: line,
          backgroundColor: dark ? "transparent" : paper["000"],
        },
        pressed && {
          backgroundColor: dark ? ink[800] : paper[200],
          borderColor: linePressed,
        },
      ]}
    >
      {({ pressed }) => (
        <View style={back.chevron}>
          <View
            style={[
              back.arm,
              back.armUpper,
              { backgroundColor: pressed ? linePressed : line },
            ]}
          />
          <View
            style={[
              back.arm,
              back.armLower,
              { backgroundColor: pressed ? linePressed : line },
            ]}
          />
        </View>
      )}
    </Pressable>
  );
}

const back = StyleSheet.create({
  ring: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
  },
  chevron: {
    width: 12,
    height: 12,
    // The arms overlap where they meet, so the vertex side carries less ink
    // than the symmetric bounding box suggests and the mark reads
    // right-heavy. A 1px nudge left is the optical correction. Tune this,
    // not the geometry.
    transform: [{ translateX: -1 }],
  },
  arm: {
    position: "absolute",
    left: 5, // (12 - 2) / 2 — centred horizontally
    top: 2, // (12 - 8) / 2 — centred vertically, then split by the rotation
    width: 2,
    height: 8,
    borderRadius: 999,
  },
  // Each arm is offset half its own rotated length (8 × sin45° / 2 ≈ 2.8) so
  // the two tips meet exactly on the centre line.
  armUpper: { transform: [{ translateY: -2.8 }, { rotate: "45deg" }] },
  armLower: { transform: [{ translateY: 2.8 }, { rotate: "-45deg" }] },
});
