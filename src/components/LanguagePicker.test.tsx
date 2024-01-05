import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguagePicker } from './LanguagePicker';

const html = renderToStaticMarkup(<LanguagePicker />);

describe('LanguagePicker', () => {
  it('offers every language, each named in itself and marked with its lang', () => {
    const options = [...html.matchAll(/<option [^>]*>[^<]*<\/option>/g)].map((match) => match[0]);
    expect(options).toEqual([
      '<option value="en" lang="en" selected="">English</option>',
      '<option value="pt-PT" lang="pt-PT">Português</option>',
      '<option value="es" lang="es">Español</option>',
      '<option value="fr" lang="fr">Français</option>',
    ]);
  });

  it('labels the select and shows the full name and the short code for the current language', () => {
    expect(html).toMatch(/^<label class="language-picker"><span class="visually-hidden">Language<\/span>/);
    expect(html).toContain('<span class="language-name">English</span><span class="language-code">EN</span>');
  });
});
