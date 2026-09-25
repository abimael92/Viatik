"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

import { isLocale, translate, type Locale, type TranslationKey } from "@/lib/i18n/translations";

const STORAGE_KEY = "viatik-language";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string;
};

const defaultContext: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (key, variables) => translate("en", key, variables),
};
const I18nContext = createContext<I18nContextValue>(defaultContext);

function readStoredLocale(): Locale | null {
  try {
    const storedLocale = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(storedLocale) ? storedLocale : null;
  } catch {
    return null;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // The first render must match the server HTML. A stored locale is applied after hydration.
  const [locale, setLocaleState] = useState<Locale>("en");

  useLayoutEffect(() => {
    const storedLocale = readStoredLocale();
    // First paint must match the server HTML; restore a stored locale once.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration restore
    if (storedLocale && storedLocale !== "en") setLocaleState(storedLocale);
  }, []);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    try {
      localStorage.setItem(STORAGE_KEY, nextLocale);
    } catch {
      // The in-page language still applies when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY && isLocale(event.newValue)) setLocaleState(event.newValue);
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const value = useMemo(() => ({ locale, setLocale, t: (key: TranslationKey, variables?: Record<string, string | number>) => translate(locale, key, variables) }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export { STORAGE_KEY };
