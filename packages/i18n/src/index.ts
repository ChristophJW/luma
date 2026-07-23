/**
 * A very small typed translator.
 *
 * Deliberately not a library. The guest camera has a 30 KB budget, and every
 * feature a general-purpose i18n package brings — locale negotiation, ICU
 * message parsing, lazy catalogues — is weight this product does not need.
 *
 * Type safety is the point: a dictionary is typed against the English one, so
 * a missing or misspelled German key is a build error rather than a string
 * that silently falls back in front of a guest.
 */

export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** German has the same one/other split as English, which is all we need. */
export interface PluralForms {
  one: string;
  other: string;
}

export type Entry = string | PluralForms;
export type Dictionary = Record<string, Entry>;

export type Values = Record<string, string | number>;

/**
 * Every other dictionary must match the shape of the reference one exactly.
 * `de` cannot omit a key, add one, or turn a plural into a plain string.
 */
export type Translations<Reference extends Dictionary> = {
  [Key in keyof Reference]: Reference[Key] extends PluralForms ? PluralForms : string;
};

function interpolate(template: string, values: Values): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

export function createTranslator<Reference extends Dictionary>(
  dictionaries: Record<Locale, Translations<Reference>>,
  locale: Locale,
) {
  const active = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];

  return function t(key: keyof Reference & string, values: Values = {}): string {
    const entry = active[key] ?? dictionaries[DEFAULT_LOCALE][key];

    // A missing key must never blank the UI or throw mid-render.
    if (entry === undefined) return key;

    const template =
      typeof entry === "string" ? entry : Number(values.count) === 1 ? entry.one : entry.other;

    return interpolate(template, values);
  };
}

/**
 * Pick the best supported locale from the device's ordered preferences.
 *
 * Matches on the language subtag, so de-AT and de-CH both get German.
 */
export function resolveLocale(preferred: readonly (string | null | undefined)[]): Locale {
  for (const tag of preferred) {
    if (!tag) continue;
    const language = tag.toLowerCase().split(/[-_]/)[0];
    const match = LOCALES.find((locale) => locale === language);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
