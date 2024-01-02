import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectLocale, LANGUAGE_KEY, readStoredLocale, storeLocale } from './detect';
import type { Locale } from './locales';

const all: Locale[] = ['en', 'pt-PT', 'es', 'fr'];

describe('detectLocale', () => {
  it('keeps a remembered choice over the browser languages', () => {
    expect(detectLocale('es', ['fr-FR'], all)).toBe('es');
  });

  it('matches the first browser language by its language subtag', () => {
    expect(detectLocale(null, ['pt-BR'], all)).toBe('pt-PT');
    expect(detectLocale(null, ['de-DE', 'fr-CA', 'es'], all)).toBe('fr');
    expect(detectLocale(null, ['EN-gb'], all)).toBe('en');
  });

  it('ignores a stored value that is not a locale we have', () => {
    expect(detectLocale('klingon', ['es-MX'], all)).toBe('es');
    expect(detectLocale('fr', ['es-MX'], ['en', 'es'])).toBe('es');
  });

  it('falls back to English', () => {
    expect(detectLocale(null, ['de', 'ja'], all)).toBe('en');
    expect(detectLocale(null, [], all)).toBe('en');
    expect(detectLocale(null, ['fr'], ['en'])).toBe('en');
  });
});

describe('stored locale', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('remembers the choice under its own key', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    storeLocale('fr');
    expect(store.get(LANGUAGE_KEY)).toBe('fr');
    expect(readStoredLocale()).toBe('fr');
  });

  it('carries on when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(readStoredLocale()).toBeNull();
    expect(() => storeLocale('es')).not.toThrow();
  });
});
