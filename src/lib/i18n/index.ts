import { useEffect, useSyncExternalStore } from "react";
import {
  defaultLanguage,
  languageStorageKey,
  localeFor,
  normalizeLanguage,
  translator,
  formatLocalizedDate,
  type Language,
} from "./core";

const translators = { kk: translator("kk"), ru: translator("ru") };
const listeners = new Set<() => void>();
let browserLanguage: Language = defaultLanguage;
let initialized = false;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function getLanguage(): Language {
  return typeof window === "undefined" ? defaultLanguage : browserLanguage;
}
export function getLocale() {
  return localeFor(getLanguage());
}
function applyLanguage(language: Language) {
  browserLanguage = language;
  document.documentElement.lang = language;
  listeners.forEach((listener) => listener());
}
export function setLanguage(language: Language) {
  applyLanguage(language);
  try {
    localStorage.setItem(languageStorageKey, language);
  } catch {
    // The switch also works when browser storage is blocked.
  }
}
function initializeLanguage() {
  if (initialized) return;
  initialized = true;
  let saved = defaultLanguage;
  try {
    saved = normalizeLanguage(localStorage.getItem(languageStorageKey));
  } catch {
    /* Use the default. */
  }
  applyLanguage(saved);
  window.addEventListener("storage", (event) => {
    if (event.key === languageStorageKey || event.key === null) {
      applyLanguage(normalizeLanguage(event.newValue));
    }
  });
}
export function useI18n() {
  const language = useSyncExternalStore(
    subscribe,
    getLanguage,
    () => defaultLanguage,
  );
  useEffect(initializeLanguage, []);
  return {
    language,
    locale: localeFor(language),
    tr: translators[language],
    setLanguage,
  };
}

export function formatDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {},
  language: Language = defaultLanguage,
) {
  return formatLocalizedDate(value, language, options);
}

// For browser event handlers and formatters outside React components.
export const translate = (source: string) => translator(getLanguage())(source);
export { translateText, localeFor, type Language } from "./core";
