import 'i18next';
import type { en } from './locales/en';

// Typed keys: `t('footer.missing')` fails tsc.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
