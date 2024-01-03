// Only TMDb answers in the viewer's language; every other provider is English-only.
export const LOCALIZED_TYPES = new Set(['movie', 'tv']);

// The app's locales and the TMDb language each one asks for.
export const TMDB_LANGUAGES = { en: 'en-US', 'pt-PT': 'pt-PT', es: 'es-ES', fr: 'fr-FR' };

/** A supported locale key from a `?lang=` value; anything else (missing, repeated, unknown) is English. */
export function parseLang(value) {
  return typeof value === 'string' && Object.hasOwn(TMDB_LANGUAGES, value) ? value : 'en';
}
