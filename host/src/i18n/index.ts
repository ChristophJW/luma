/**
 * Host app translations.
 *
 * The locale comes from the device on first launch and can be overridden by
 * the person. Everything reads through `useT()`, so no component holds a
 * literal string.
 */

import { getLocales } from "expo-localization";
import { createContext, createElement, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { type Locale, createTranslator, resolveLocale } from "@luma/i18n";

import { de } from "./de";
import { type HostDictionary, en } from "./en";

const dictionaries = { en, de };

/** The device's ordered language preferences, best match wins. */
export function deviceLocale(): Locale {
  try {
    return resolveLocale(getLocales().map((entry) => entry.languageTag));
  } catch {
    // getLocales can throw in odd environments; English is a safe floor.
    return "en";
  }
}

export type TranslateFn = (key: keyof HostDictionary & string, values?: Record<string, string | number>) => string;

interface I18nValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: TranslateFn;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(deviceLocale);

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: createTranslator<HostDictionary>(dictionaries, locale) }),
    [locale],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function useT(): TranslateFn {
  return useI18n().t;
}
