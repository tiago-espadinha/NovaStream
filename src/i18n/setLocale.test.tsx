import { renderToStaticMarkup } from 'react-dom/server';
import { useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n, { setLocale } from '.';
import { LANGUAGE_KEY } from './detect';

function Probe() {
  const { t } = useTranslation();
  return <p>{t('header.language')}</p>;
}

describe('setLocale', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
    i18n.removeResourceBundle('fr', 'translation');
    vi.unstubAllGlobals();
  });

  it('switches the rendered text and <html lang>, and remembers the choice', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: (key: string, value: string) => store.set(key, value) });
    vi.stubGlobal('document', { documentElement: { lang: 'en' } });
    i18n.addResourceBundle('fr', 'translation', { header: { language: 'Langue' } });

    expect(renderToStaticMarkup(<Probe />)).toBe('<p>Language</p>');
    await setLocale('fr');

    expect(renderToStaticMarkup(<Probe />)).toBe('<p>Langue</p>');
    expect(document.documentElement.lang).toBe('fr');
    expect(store.get(LANGUAGE_KEY)).toBe('fr');
  });
});
