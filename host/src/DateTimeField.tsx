/**
 * Native date and time entry.
 *
 * Uses the platform picker, so iOS gets its wheel and Android its dialog. A
 * host tapping a date expects the control their phone has always shown them.
 *
 * Metro resolves `DateTimeField.web.tsx` for the web target instead, which is
 * how this module and its native dependency stay out of the web bundle.
 */

import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text } from "react-native";

import { ink, paper, radius, space } from "@luma/tokens";

import {
  type DateTimeFieldProps,
  parseDate,
  parseTime,
  toDateString,
  toTimeString,
} from "./datetime";
import { CalendarIcon, ClockIcon } from "./Icons";
import { useI18n } from "./i18n";

function Trigger({
  display,
  empty,
  onPress,
  accessibilityLabel,
  icon,
}: {
  display: string;
  empty: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  icon: "date" | "time";
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.trigger}
    >
      <Text style={[styles.triggerText, empty && styles.triggerPlaceholder]} numberOfLines={1}>
        {display}
      </Text>
      {icon === "date" ? <CalendarIcon /> : <ClockIcon />}
    </Pressable>
  );
}

/**
 * Android fires once and dismisses itself; iOS keeps the picker mounted until
 * it is closed explicitly. Handling both here keeps the callers identical.
 */
function useDismiss(setOpen: (next: boolean) => void) {
  return (eventType: string | undefined, apply: () => void) => {
    if (Platform.OS === "android") setOpen(false);
    if (eventType === "dismissed") return;
    apply();
    if (Platform.OS === "ios") setOpen(false);
  };
}

export function DateField({ value, onChange, accessibilityLabel }: DateTimeFieldProps) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const handle = useDismiss(setOpen);

  // "Sat 12 Sep" / "Sa., 12. Sept." — whatever the active locale formats to.
  const display = value
    ? new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(parseDate(value))
    : t("date.placeholder");

  return (
    <>
      <Trigger
        display={display}
        empty={!value}
        onPress={() => setOpen(true)}
        accessibilityLabel={accessibilityLabel}
        icon="date"
      />
      {open ? (
        <DateTimePicker
          mode="date"
          value={value ? parseDate(value) : new Date()}
          onChange={(event, selected) =>
            handle(event.type, () => selected && onChange(toDateString(selected)))
          }
        />
      ) : null}
    </>
  );
}

export function TimeField({ value, onChange, accessibilityLabel }: DateTimeFieldProps) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const handle = useDismiss(setOpen);

  const display = value
    ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
        parseTime(value),
      )
    : t("time.placeholder");

  return (
    <>
      <Trigger
        display={display}
        empty={!value}
        onPress={() => setOpen(true)}
        accessibilityLabel={accessibilityLabel}
        icon="time"
      />
      {open ? (
        <DateTimePicker
          mode="time"
          // Germany reads 24-hour clocks; the active locale decides.
          is24Hour={locale === "de"}
          value={value ? parseTime(value) : new Date()}
          onChange={(event, selected) =>
            handle(event.type, () => selected && onChange(toTimeString(selected)))
          }
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[2],
    paddingHorizontal: space[4],
    borderWidth: 1,
    borderColor: paper[300],
    borderRadius: radius.control,
    backgroundColor: paper["000"],
  },
  triggerText: { flex: 1, fontSize: 17, color: ink[900] },
  triggerPlaceholder: { color: ink[600] },
});
