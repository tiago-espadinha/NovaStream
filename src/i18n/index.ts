import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { detectLocale, readStoredLocale, storeLocale } from './detect';
import { en } from './locales/en';
import { ptPT } from './locales/pt-PT';
import type { Locale } from './locales';
import type { Messages } from './types';

export const catalogs: Partial<Record<Locale, Messages>> = { en, 'pt-PT': ptPT };
export const availableLocales = Object.keys(catalogs) as Locale[];

function syncDocumentLanguage(language: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
}

i18n.on('languageChanged', syncDocumentLanguage);

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(
    Object.entries(catalogs).map(([locale, messages]) => [locale, { translation: messages }]),
  ),
  // Without a browser (tests, prerender) the app speaks English.
  lng:
    typeof navigator === 'undefined'
      ? 'en'
      : detectLocale(readStoredLocale(), navigator.languages ?? [], availableLocales),
  fallbackLng: 'en',
  // Catalogs are bundled, so init finishes before the first render.
  initAsync: false,
  interpolation: { escapeValue: false },
});

export async function setLocale(locale: Locale) {
  storeLocale(locale);
  await i18n.changeLanguage(locale);
}

/** The active locale, for Intl formatting. */
export const currentLocale = () => (i18n.resolvedLanguage ?? 'en') as Locale;

export default i18n;
