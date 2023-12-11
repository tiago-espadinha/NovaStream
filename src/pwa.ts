import type { VitePWAOptions } from 'vite-plugin-pwa';

// The manifest cannot read CSS variables; keep in sync with --color-bg in styles/tokens.css.
const APP_BACKGROUND = '#100d19';

export const pwaOptions: Partial<VitePWAOptions> = {
  // A new deploy activates its worker at once, so the next load shows the new build.
  registerType: 'autoUpdate',
  // Registration is done in main.tsx.
  injectRegister: false,
  includeAssets: ['nova-stream.svg', 'apple-touch-icon-180x180.png'],
  manifest: {
    name: 'Nova Stream',
    short_name: 'Nova Stream',
    description: 'Find a movie, show, book or album and save it for later.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: APP_BACKGROUND,
    theme_color: APP_BACKGROUND,
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // Precache the app shell only. API calls, fonts and artwork always go to the network.
    globPatterns: ['**/*.{js,css,html,svg,png}'],
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/api\//],
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    skipWaiting: true,
  },
};
