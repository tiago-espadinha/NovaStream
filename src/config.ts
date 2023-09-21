// Toggle between the bundled mock dataset and the real backend without touching code
// elsewhere. Flip VITE_USE_MOCK=false once your server (see /server) is running and has
// its API keys set.

declare global {
  interface ImportMeta {
    readonly env: {
      readonly VITE_USE_MOCK?: string;
      readonly VITE_API_BASE_URL?: string;
    };
  }
}

export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
