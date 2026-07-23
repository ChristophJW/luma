/**
 * Web date and time entry.
 *
 * Uses the browser's own `<input type="date">` and `type="time"`. They are
 * keyboard-accessible, already localised, and cost nothing in bundle size —
 * shipping a JavaScript calendar here would be strictly worse.
 *
 * Metro resolves this file for the web target, so the native picker module is
 * never pulled into the web bundle.
 */

import { View } from "react-native";

import { glow, ink, paper, radius, space } from "@luma/tokens";

import type { DateTimeFieldProps } from "./datetime";
import { CalendarIcon, ClockIcon } from "./Icons";

/**
 * Injected once, because these rules cannot be expressed as inline styles.
 *
 * `color-scheme: light` is the important one. Without it the browser renders
 * the field *and its popup calendar* using the operating system's scheme, so
 * a host on a dark-mode laptop gets a dark picker sitting in a light app.
 * The host app is light by default (DESIGN.md §11); the native widget has to
 * be told that.
 *
 * The default indicator is then made transparent and stretched over the whole
 * field, so tapping anywhere opens the picker while our own icon is what is
 * actually visible.
 */
const STYLE_ID = "luma-datetime-input";
const CSS = `
.luma-datetime {
  color-scheme: light;
  /* Replaces the operating system's accent — the blue that otherwise shows
     up on the focused segment and inside the popup. */
  accent-color: ${glow[600]};
  caret-color: ${ink[900]};
}
.luma-datetime::-webkit-calendar-picker-indicator {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  opacity: 0;
  cursor: pointer;
}
.luma-datetime::-webkit-datetime-edit {
  color: ${ink[900]};
}
/* Chrome highlights the segment you are editing with the system accent.
   glow-700 rather than glow-600: white on glow-600 is 3.5:1, which fails AA
   for text this size. */
.luma-datetime::-webkit-datetime-edit-day-field:focus,
.luma-datetime::-webkit-datetime-edit-month-field:focus,
.luma-datetime::-webkit-datetime-edit-year-field:focus,
.luma-datetime::-webkit-datetime-edit-hour-field:focus,
.luma-datetime::-webkit-datetime-edit-minute-field:focus,
.luma-datetime::-webkit-datetime-edit-ampm-field:focus {
  background-color: ${glow[700]};
  color: ${paper["000"]};
  border-radius: 3px;
  outline: none;
}
.luma-datetime::selection {
  background-color: ${glow[700]};
  color: ${paper["000"]};
}
.luma-datetime:focus-visible {
  outline: 2px solid ${ink[900]};
  outline-offset: 2px;
}
`;

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const element = document.createElement("style");
  element.id = STYLE_ID;
  element.textContent = CSS;
  document.head.appendChild(element);
}

const inputStyle: React.CSSProperties = {
  minHeight: 52,
  width: "100%",
  boxSizing: "border-box",
  // Room on the right for the icon.
  padding: `${space[3]}px 44px ${space[3]}px ${space[4]}px`,
  border: `1px solid ${paper[300]}`,
  borderRadius: radius.control,
  backgroundColor: paper["000"],
  fontSize: 17,
  fontFamily: "inherit",
  color: ink[900],
  position: "relative",
};

function WebInput({
  type,
  value,
  onChange,
  accessibilityLabel,
}: DateTimeFieldProps & { type: "date" | "time" }) {
  ensureStyles();

  return (
    <View style={{ position: "relative", justifyContent: "center" }}>
      <input
        className="luma-datetime"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={accessibilityLabel}
        style={inputStyle}
      />
      <View style={{ position: "absolute", right: space[4] }} pointerEvents="none">
        {type === "date" ? <CalendarIcon /> : <ClockIcon />}
      </View>
    </View>
  );
}

export function DateField(props: DateTimeFieldProps) {
  return <WebInput type="date" {...props} />;
}

export function TimeField(props: DateTimeFieldProps) {
  return <WebInput type="time" {...props} />;
}
