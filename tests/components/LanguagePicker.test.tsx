// @vitest-environment jsdom
import '../helpers/dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguagePicker } from '../../src/components/LanguagePicker/LanguagePicker';
import i18n from '../../src/i18n';

const html = renderToStaticMarkup(<LanguagePicker />);

describe('LanguagePicker', () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

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

  it('switches language when one is picked, and shows the new one', async () => {
    const { container } = render(<LanguagePicker />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'pt-PT' } });

    await waitFor(() => expect(i18n.resolvedLanguage).toBe('pt-PT'));
    await waitFor(() => expect(container.querySelector('.language-code')?.textContent).toBe('PT'));
    expect(container.querySelector('.language-name')?.textContent).toBe('Português');
  });
});
