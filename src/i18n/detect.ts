import { isLocale, type Locale } from './locales';

export const LANGUAGE_KEY = 'nova-stream:language';

const baseLanguage = (tag: string) => tag.toLowerCase().split('-')[0];

/**
 * A remembered choice wins, then the first browser language we have a catalog for, then
 * English. Only the language subtag is compared, so pt-BR reads Portuguese and fr-CA French.
 */
export function detectLocale(
  stored: string | null,
  languages: readonly string[],
  available: readonly Locale[],
): Locale {
  if (isLocale(stored) && available.includes(stored)) return stored;
  for (const tag of languages) {
    const match = available.find((locale) => baseLanguage(locale) === baseLanguage(tag));
    if (match) return match;
  }
  return 'en';
}

// Storage can be blocked (private windows, site-data settings); the choice then lasts the visit.
export function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale) {
  try {
    localStorage.setItem(LANGUAGE_KEY, locale);
  } catch {
    // Not remembered; the page still switches.
  }
}
