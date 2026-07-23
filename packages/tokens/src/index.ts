/**
 * Typed mirror of tokens.css, for React Native (host app) where CSS custom
 * properties are unavailable.
 *
 * Keep in sync with tokens.css. See DESIGN.md §4–6.
 */

export const ink = {
  900: "#14110F",
  800: "#1E1A17",
  700: "#2B2521",
  600: "#3D352F",
  500: "#5A4F47",
} as const;

export const paper = {
  "000": "#FFFDFA",
  100: "#F7F3ED",
  200: "#EDE7DE",
  300: "#DDD4C8",
} as const;

export const glow = {
  400: "#F2B45C",
  500: "#E09538",
  600: "#C47621",
  700: "#8A4E12",
} as const;

export const safelight = "#C2413A" as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
  24: 96,
} as const;

export const radius = {
  control: 8,
  card: 12,
  photo: 4,
  pill: 999,
} as const;

export const motion = {
  micro: 120,
  transition: 240,
  considered: 400,
  shutter: 80,
} as const;

/** Minimum touch target. Dark room, on the move. DESIGN.md non-negotiable #5. */
export const TAP_TARGET_MIN = 44;

/** Shutter diameter. DESIGN.md §7. */
export const SHUTTER_SIZE = 80;

/**
 * Approved foreground/background pairs, with computed contrast ratios.
 * Anything not listed here has not been verified — do not assume it passes.
 */
export const contrast = {
  "paper100-on-ink900": 17.0,
  "ink900-on-paper000": 17.0,
  "glow400-on-ink900": 10.3,
  "glow700-on-paper000": 6.5,
  /** Large text (>=24px) and non-text UI only. Fails for body copy. */
  "glow600-on-paper000": 3.5,
  /** Large text and non-text UI only. Fails for body copy. */
  "safelight-on-ink900": 3.7,
} as const;
