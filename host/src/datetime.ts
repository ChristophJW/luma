/**
 * Date and time helpers shared by the web and native field implementations.
 *
 * Values travel as plain strings — "YYYY-MM-DD" and "HH:MM" — because that is
 * what `<input type="date">` speaks natively and what the wizard assembles
 * into instants.
 */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toTimeString(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Parse as a *local* date, never UTC — a wedding happens in local time. */
export function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

export function parseTime(value: string): Date {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

export interface DateTimeFieldProps {
  value: string;
  onChange: (next: string) => void;
  accessibilityLabel: string;
}
