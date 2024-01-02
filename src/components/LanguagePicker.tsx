import { useTranslation } from 'react-i18next';
import { availableLocales, setLocale } from '../i18n';
import { isLocale, LOCALE_NAMES } from '../i18n/locales';

/**
 * The language switcher in the header. A native select sits invisibly over the visible label,
 * so the closed control can show "EN" on small screens while the list keeps each language named in itself.
 */
export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  if (availableLocales.length < 2) return null;
  const current = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';

  return (
    <label className="language-picker">
      <span className="visually-hidden">{t('header.language')}</span>
      <span className="language-current" aria-hidden="true">
        <span className="language-name">{LOCALE_NAMES[current]}</span>
        <span className="language-code">{current.split('-')[0].toUpperCase()}</span>
      </span>
      <svg className="language-chevron" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
      <select
        value={current}
        onChange={(event) => {
          if (isLocale(event.target.value)) void setLocale(event.target.value);
        }}
      >
        {availableLocales.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {LOCALE_NAMES[locale]}
          </option>
        ))}
      </select>
    </label>
  );
}
