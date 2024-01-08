/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './src/pwa';

export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions)],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    // Tests render with the bundled English catalog, whatever language the machine running them prefers.
    setupFiles: ['tests/helpers/i18nSetup.ts'],
    css: true,
    // The file cache keeps each test's import.meta.glob result, so tests that scan src/ (the coverage,
    // untranslated-copy and CSS rules) would never see a new file.
    fsModuleCache: false,
  },
});
