export const LOCALES = ['en', 'pt-PT', 'es', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language named in itself, so a reader finds theirs whatever the current language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  'pt-PT': 'Português',
  es: 'Español',
  fr: 'Français',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
