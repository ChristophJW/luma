/**
 * Event setup — a wizard, one decision per screen.
 *
 * Creates a new event, or edits an existing one. The steps are identical
 * either way: a host who wants to change the reveal time should walk the same
 * path they already know, not hunt through a different settings screen.
 *
 * "A sequence, not a settings page." DESIGN.md §11, fields from CONCEPT.md §1.
 *
 * The wizard asks only what it cannot sensibly default. Capture mode and
 * album visibility keep their recommended values and move to event settings
 * afterwards — putting them here turns the sequence back into a form.
 */

import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { glow, ink, paper, radius, space } from "@luma/tokens";

import { ApiError, type EventDraft, type LumaEvent, type Theme, events } from "./api";
import { toDateString, toTimeString } from "./datetime";
import { DateField, TimeField } from "./DateTimeField";
import { BackButton } from "./Icons";
import { type TranslateFn, useT } from "./i18n";
import { Button, ErrorText, Field, Input, Toggle, styles as ui } from "./ui";

const STEPS = [
  { key: "basics", heading: "basics.heading" },
  { key: "look", heading: "look.heading" },
  { key: "guests", heading: "guests.heading" },
  { key: "reveal", heading: "reveal.heading" },
  { key: "privacy", heading: "privacy.heading" },
] as const;

/** Swatches stand in until the preview renders a real sample frame through
 *  each treatment — DESIGN.md §11. */
const THEMES = [
  { value: "noon", swatch: "#E8E2D8" },
  { value: "golden", swatch: "#E0A94F" },
  { value: "tungsten", swatch: "#A65E1E" },
  { value: "silver", swatch: "#9A948C" },
  { value: "safelight", swatch: "#8E3B35" },
  { value: "polar", swatch: "#E4E7E6" },
] as const satisfies readonly { value: Theme; swatch: string }[];

/** Capacity is what a host buys, so it is a choice between packages rather
 *  than a free-form number. Mirrors the pricing table in CONCEPT.md. */
const CAPACITIES = [5, 25, 50, 100, 200] as const;

function emptyDraft(): EventDraft {
  return {
    title: "",
    event_type: "wedding",
    location: "",
    timezone_name: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
    capture_starts_at: null,
    capture_ends_at: null,
    reveals_at: null,
    theme: "golden",
    highlight_reel_enabled: true,
    guest_capacity: 50,
    shots_per_guest: 20,
    // Recommended defaults; editable in event settings, not in the wizard.
    visibility_mode: "hidden",
    capture_mode: "camera_only",
    guest_downloads_enabled: true,
    involves_minors: false,
    face_lookup_enabled: false,
    blur_child_faces: false,
  };
}

/** Strip the server-owned fields, leaving just what the wizard edits. */
function draftFrom(event: LumaEvent): EventDraft {
  const {
    id: _id,
    status: _status,
    join_code: _joinCode,
    public_slug: _slug,
    revealed_at: _revealedAt,
    is_capture_open: _open,
    is_revealed: _revealed,
    participant_count: _participants,
    photo_count: _photos,
    ...draft
  } = event;
  return draft;
}

/** Split a stored instant back into the date and time a person edits. */
function localParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };
  return { date: toDateString(parsed), time: toTimeString(parsed) };
}

function combine(date: string, time: string): string | null {
  if (!date.trim()) return null;
  const parsed = new Date(`${date.trim()}T${time.trim() || "00:00"}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function EventWizard({
  token,
  event,
  onDone,
  onCancel,
}: {
  token: string;
  /** Omitted when creating. */
  event?: LumaEvent;
  onDone: (event: LumaEvent) => void;
  onCancel: () => void;
}) {
  const isEditing = event !== undefined;

  const [draft, setDraft] = useState<EventDraft>(() =>
    event ? draftFrom(event) : emptyDraft(),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const starts = localParts(event?.capture_starts_at ?? null);
  const ends = localParts(event?.capture_ends_at ?? null);
  const reveals = localParts(event?.reveals_at ?? null);

  const [date, setDate] = useState(starts.date);
  const [startTime, setStartTime] = useState(starts.time || "15:00");
  const [endTime, setEndTime] = useState(ends.time || "03:00");
  // Stored as "when the event ends" only if the two instants match exactly.
  const [revealAtEnd, setRevealAtEnd] = useState(
    Boolean(event?.reveals_at && event.reveals_at === event.capture_ends_at),
  );
  const [revealDate, setRevealDate] = useState(reveals.date);
  const [revealTime, setRevealTime] = useState(reveals.time || "12:00");

  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const t = useT();
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  function set<K extends keyof EventDraft>(key: K, value: EventDraft[K]) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "blur_child_faces") {
        // Asking for blurring is itself the declaration that children are
        // present — the server refuses one without the other — and declaring
        // children rules out face lookup.
        next.involves_minors = value === true;
        next.face_lookup_enabled = value === true ? false : next.face_lookup_enabled;
      }
      return next;
    });
    setError(null);
  }

  function buildPayload(): EventDraft {
    const startsAt = combine(date, startTime);
    let endsAt = combine(date, endTime);
    // An end earlier than the start means the party ran past midnight.
    if (startsAt && endsAt && endsAt <= startsAt) {
      const next = new Date(endsAt);
      next.setDate(next.getDate() + 1);
      endsAt = next.toISOString();
    }
    return {
      ...draft,
      capture_starts_at: startsAt,
      capture_ends_at: endsAt,
      reveals_at: revealAtEnd ? endsAt : combine(revealDate, revealTime),
    };
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload = buildPayload();
      onDone(
        isEditing
          ? await events.update(token, event.id, payload)
          : await events.create(token, payload),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : t("error.offline"),
      );
      setBusy(false);
    }
  }

  const canContinue = step.key !== "basics" || draft.title.trim().length > 0;

  return (
    <View style={styles.root}>
      <View style={[styles.frame, { maxHeight: height }]}>
        {/* Header — fixed, never scrolls away */}
        <View style={[styles.header, { paddingTop: insets.top + space[4] }]}>
          <View style={styles.headerTop}>
            <BackButton
              onPress={() => (stepIndex === 0 ? onCancel() : setStepIndex((i) => i - 1))}
              accessibilityLabel={stepIndex === 0 ? t("wizard.cancel") : t("wizard.back")}
            />
            <View style={styles.progress}>
              {STEPS.map((entry, position) => (
                <View
                  key={entry.key}
                  style={[styles.progressBar, position <= stepIndex && styles.progressBarDone]}
                />
              ))}
            </View>
          </View>
          <Text style={styles.stepCount}>
            {t("wizard.step", { current: stepIndex + 1, total: STEPS.length })}
          </Text>
          <Text style={ui.display}>{t(step.heading)}</Text>
        </View>

        {/* Body — scrolls only if a step genuinely overflows */}
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {step.key === "basics" && (
            <>
<Text style={styles.lede}>{t("basics.lede")}</Text>
              <Field label={t("basics.nameLabel")}>
                <Input
                  value={draft.title}
                  onChangeText={(value) => set("title", value)}
                  placeholder={t("basics.namePlaceholder")}
                  // Creating: jump straight to the name. Editing: the field is
                  // already filled, so opening the keyboard just hides content.
                  autoFocus={!isEditing}
                  accessibilityLabel={t("basics.nameLabel")}
                />
              </Field>
              {/* Date first, on its own line — it is the decision. The two
                  times sit under it because they are a pair. */}
              <Field label={t("basics.dateLabel")}>
                <DateField
                  value={date}
                  onChange={setDate}
                  accessibilityLabel={t("basics.dateLabel")}
                />
              </Field>
              <View style={styles.row}>
                <View style={styles.rowHalf}>
                  <Field label={t("basics.startLabel")}>
                    <TimeField
                      value={startTime}
                      onChange={setStartTime}
                      accessibilityLabel={t("basics.startLabel")}
                    />
                  </Field>
                </View>
                <View style={styles.rowHalf}>
                  <Field label={t("basics.endLabel")}>
                    <TimeField
                      value={endTime}
                      onChange={setEndTime}
                      accessibilityLabel={t("basics.endLabel")}
                    />
                  </Field>
                </View>
              </View>
              <Field label={t("basics.locationLabel")}>
                <Input
                  value={draft.location}
                  onChangeText={(value) => set("location", value)}
                  placeholder={t("basics.locationPlaceholder")}
                  accessibilityLabel={t("basics.locationLabel")}
                />
              </Field>
            </>
          )}

          {step.key === "look" && (
            <ThemePicker value={draft.theme} onChange={(value) => set("theme", value)} t={t} />
          )}

          {step.key === "guests" && (
            <>
<Text style={styles.lede}>{t("guests.lede")}</Text>
              <Stepper
                value={draft.shots_per_guest}
                min={1}
                max={100}
                t={t}
                caption={t("guests.photosEach")}
                onChange={(value) => set("shots_per_guest", value)}
              />
              <Field label={t("guests.capacityLabel")}>
                <View style={styles.chips}>
                  {CAPACITIES.map((capacity) => {
                    const selected = draft.guest_capacity === capacity;
                    return (
                      <Pressable
                        key={capacity}
                        onPress={() => set("guest_capacity", capacity)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        style={[styles.chip, selected && styles.chipSelected]}
                      >
                        <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                          {capacity}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>
              <Text style={styles.derived}>
                {t("guests.derived", {
                  guests: draft.guest_capacity,
                  total: draft.guest_capacity * draft.shots_per_guest,
                })}
              </Text>
              <View style={styles.note}>
                <Text style={styles.noteTitle}>{t("guests.qrTitle")}</Text>
<Text style={styles.noteBody}>{t("guests.qrBody")}</Text>
              </View>
            </>
          )}

          {step.key === "reveal" && (
            <>
<Text style={styles.lede}>{t("reveal.lede")}</Text>
              <Radio
                label={t("reveal.atEnd")}
                description={t("reveal.atEndDescription")}
                selected={revealAtEnd}
                onPress={() => setRevealAtEnd(true)}
              />
              <Radio
                label={t("reveal.atTime")}
                description={t("reveal.atTimeDescription")}
                selected={!revealAtEnd}
                onPress={() => setRevealAtEnd(false)}
              >
                <View style={styles.stack}>
                  <DateField
                    value={revealDate}
                    onChange={setRevealDate}
                    accessibilityLabel={t("reveal.dateLabel")}
                  />
                  <TimeField
                    value={revealTime}
                    onChange={setRevealTime}
                    accessibilityLabel={t("reveal.timeLabel")}
                  />
                </View>
              </Radio>
              <Toggle
                label={t("reveal.highlightReel")}
                description={t("reveal.highlightReelDescription")}
                value={draft.highlight_reel_enabled}
                onChange={(value) => set("highlight_reel_enabled", value)}
              />
            </>
          )}

          {step.key === "privacy" && (
            <>
              <Toggle
                label={t("privacy.downloads")}
                description={t("privacy.downloadsDescription")}
                value={draft.guest_downloads_enabled}
                onChange={(value) => set("guest_downloads_enabled", value)}
              />
              {/* The "blur children's faces" toggle is hidden for now while the
                  blur model accuracy is worked out. The draft still sends
                  blur_child_faces: false, and the set() handler above is kept,
                  so restoring it is just re-adding this Toggle. */}
            </>
          )}

          {error ? <ErrorText>{error}</ErrorText> : null}
        </ScrollView>

        {/* Footer — pinned, so Continue is always reachable by thumb */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + space[6] }]}>
          <Button
            label={
              isLast
                ? busy
                  ? t(isEditing ? "wizard.saving" : "wizard.creating")
                  : t(isEditing ? "wizard.save" : "wizard.create")
                : t("wizard.continue")
            }
            onPress={() => (isLast ? submit() : setStepIndex((i) => i + 1))}
            disabled={busy || !canContinue}
          />
          {/* Editing must not mean walking all five steps to change one
              field, so an existing event can be saved from wherever the host
              happens to be. Creating still runs the whole sequence — the
              later steps are where the defaults get confirmed. */}
          {isEditing && !isLast ? (
            <Button
              label={busy ? t("wizard.saving") : t("wizard.saveAndBack")}
              variant="quiet"
              onPress={submit}
              disabled={busy || !canContinue}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Radio({
  label,
  description,
  selected,
  onPress,
  children,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.radio, selected && styles.radioSelected]}
    >
      <View style={styles.radioHead}>
        <View style={[styles.dot, selected && styles.dotSelected]}>
          {selected ? <View style={styles.dotInner} /> : null}
        </View>
        <View style={styles.radioText}>
          <Text style={[styles.radioLabel, selected && styles.radioLabelSelected]}>{label}</Text>
          {description ? <Text style={styles.noteBody}>{description}</Text> : null}
        </View>
      </View>
      {selected && children ? <View style={styles.radioBody}>{children}</View> : null}
    </Pressable>
  );
}

function ThemePicker({
  value,
  onChange,
  t,
}: {
  value: Theme;
  onChange: (next: Theme) => void;
  t: TranslateFn;
}) {
  const selected = THEMES.find((theme) => theme.value === value) ?? THEMES[0];
  const position = THEMES.indexOf(selected) + 1;
  // Theme names are product names; only the descriptions are translated.
  const nameOf = (theme: Theme) => t(`theme.${theme}` as "theme.noon");
  const describe = (theme: Theme) => t(`theme.${theme}Description` as "theme.noonDescription");

  return (
    <View style={styles.themeBlock}>
      <Text style={styles.lede}>{t("look.lede")}</Text>
      <View style={[styles.preview, { backgroundColor: selected.swatch }]}>
        <Text style={styles.previewNote}>{t("look.sampleFrame")}</Text>
      </View>
      <View style={styles.themeHeading}>
        <Text style={ui.displaySmall}>{nameOf(selected.value)}</Text>
        <Text style={styles.themeCount}>
          {t("look.position", { position, total: THEMES.length })}
        </Text>
      </View>
      <Text style={styles.noteBody}>{describe(selected.value)}</Text>
      <View style={styles.swatchRow}>
        {THEMES.map((theme) => {
          const isSelected = theme.value === value;
          return (
            <Pressable
              key={theme.value}
              onPress={() => onChange(theme.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={nameOf(theme.value)}
              style={styles.swatchTarget}
            >
              <View
                style={[
                  styles.swatchChip,
                  { backgroundColor: theme.swatch },
                  isSelected && styles.swatchChipSelected,
                ]}
              />
              <Text style={[styles.swatchLabel, isSelected && styles.swatchLabelSelected]}>
                {nameOf(theme.value)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Stepper({
  value,
  min,
  max,
  caption,
  onChange,
  t,
}: {
  value: number;
  min: number;
  max: number;
  caption: string;
  onChange: (next: number) => void;
  t: TranslateFn;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        accessibilityRole="button"
        accessibilityLabel={t("guests.fewer")}
        style={styles.stepperButton}
      >
        <Text style={styles.stepperGlyph}>−</Text>
      </Pressable>
      <View style={styles.stepperValue}>
        <Text style={styles.stepperNumber}>{value}</Text>
        <Text style={styles.stepperCaption}>{caption}</Text>
      </View>
      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        accessibilityRole="button"
        accessibilityLabel={t("guests.more")}
        style={styles.stepperButton}
      >
        <Text style={styles.stepperGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", backgroundColor: paper[100] },
  // A single column at phone width, centred on desktop. A wizard reads the
  // same everywhere; widening it just turns it back into a form.
  frame: { flex: 1, width: "100%", maxWidth: 460 },

  header: { paddingHorizontal: space[6], paddingTop: space[4], gap: space[3] },
  headerTop: { flexDirection: "row", alignItems: "center", gap: space[3] },
  // A ringed circle, so the only way back out of the wizard reads as a control
  // rather than as stray punctuation next to the progress bars.

  // Each arm is offset half its own rotated length (8 × sin45° / 2 ≈ 2.8) so
  // the two tips meet exactly on the centre line. { rotate: "45deg" }] }, { rotate: "-45deg" }] },
  progress: { flex: 1, flexDirection: "row", gap: space[1] },
  progressBar: { flex: 1, height: 3, borderRadius: radius.pill, backgroundColor: paper[300] },
  progressBarDone: { backgroundColor: glow[600] },
  stepCount: { fontSize: 12, fontWeight: "500", letterSpacing: 1.2, color: glow[700] },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: space[6], paddingTop: space[4], paddingBottom: space[6], gap: space[4] },
  lede: { fontSize: 15, lineHeight: 22, color: ink[500] },

  footer: {
    gap: space[2],
    paddingHorizontal: space[6],
    paddingTop: space[3],
    paddingBottom: space[6],
    borderTopWidth: 1,
    borderTopColor: paper[200],
    backgroundColor: paper[100],
  },

  row: { flexDirection: "row", gap: space[2] },
  // flexBasis 0 + minWidth 0 so both halves are exactly 50% regardless of
  // their content — otherwise a long formatted date can push its sibling
  // narrower on the web target.
  rowHalf: { flex: 1, flexBasis: 0, minWidth: 0 },
  stack: { gap: space[2] },

  chips: { flexDirection: "row", gap: space[2] },
  chip: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: paper[300],
    backgroundColor: paper["000"],
  },
  chipSelected: { borderColor: glow[600], borderWidth: 2, backgroundColor: paper["000"] },
  chipLabel: { fontSize: 16, color: ink[500], fontVariant: ["tabular-nums"] },
  chipLabelSelected: { color: ink[900], fontWeight: "600" },
  derived: { fontSize: 14, color: ink[500], textAlign: "center" },

  note: {
    padding: space[4],
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: paper[300],
    backgroundColor: paper["000"],
    gap: space[1],
  },
  noteTitle: { fontSize: 15, fontWeight: "500", color: ink[900] },
  noteBody: { fontSize: 14, lineHeight: 20, color: ink[500] },

  radio: {
    padding: space[4],
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: paper[300],
    backgroundColor: paper["000"],
    gap: space[3],
  },
  radioSelected: { borderColor: glow[600], borderWidth: 2 },
  radioHead: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  radioText: { flex: 1, gap: 2 },
  radioLabel: { fontSize: 16, color: ink[900] },
  radioLabelSelected: { fontWeight: "600" },
  radioBody: { paddingLeft: space[8] },
  dot: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: paper[300],
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  dotSelected: { borderColor: glow[600], borderWidth: 2 },
  dotInner: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: glow[600] },

  themeBlock: { gap: space[3] },
  preview: {
    height: 200,
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: paper[300],
  },
  previewNote: { fontSize: 13, color: ink[500] },
  themeHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  themeCount: { fontSize: 13, color: ink[500] },
  swatchRow: { flexDirection: "row", gap: space[2] },
  swatchTarget: { flex: 1, alignItems: "center", gap: space[1], minHeight: 44 },
  swatchChip: {
    width: "100%",
    height: 40,
    borderRadius: radius.control,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchChipSelected: { borderColor: glow[600] },
  swatchLabel: { fontSize: 11, color: ink[500] },
  swatchLabelSelected: { color: ink[900], fontWeight: "600" },

  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: space[4],
    borderRadius: radius.card,
    backgroundColor: paper[200],
  },
  stepperButton: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: paper["000"],
    alignItems: "center",
    justifyContent: "center",
  },
  stepperGlyph: { fontSize: 24, color: ink[900] },
  stepperValue: { alignItems: "center", gap: space[1] },
  stepperNumber: { fontSize: 48, lineHeight: 52, color: ink[900], fontVariant: ["tabular-nums"] },
  stepperCaption: { fontSize: 12, letterSpacing: 1.2, color: ink[500] },
});
