/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './src/pwa';

export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions)],
  // Tests render with the bundled English catalog, whatever language the machine running them prefers.
  test: { setupFiles: ['src/i18n/testSetup.ts'] },
});
