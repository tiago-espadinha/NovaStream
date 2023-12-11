import { describe, expect, it } from 'vitest';
import { pwaOptions } from './pwa';

describe('pwaOptions', () => {
  const workbox = pwaOptions.workbox!;

  it('never answers /api navigations with the cached shell', () => {
    const denied = (path: string) => workbox.navigateFallbackDenylist!.some((re) => re.test(path));
    expect(denied('/api/search?q=dune')).toBe(true);
    expect(denied('/api/auth/me')).toBe(true);
    expect(denied('/saved')).toBe(false);
    expect(denied('/apiary')).toBe(false);
  });

  it('has no runtime cache that could store API responses', () => {
    expect(workbox.runtimeCaching ?? []).toEqual([]);
  });

  it('replaces the old shell as soon as a new deploy is found', () => {
    expect(pwaOptions.registerType).toBe('autoUpdate');
    expect(workbox.skipWaiting).toBe(true);
    expect(workbox.clientsClaim).toBe(true);
    expect(workbox.cleanupOutdatedCaches).toBe(true);
  });

  it('declares the icons Chrome needs to offer installation', () => {
    const icons = pwaOptions.manifest && pwaOptions.manifest.icons;
    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
        expect.objectContaining({ sizes: '512x512', type: 'image/png' }),
        expect.objectContaining({ purpose: 'maskable' }),
      ]),
    );
  });
});
