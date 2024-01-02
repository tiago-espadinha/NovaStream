import type { en } from './locales/en';

/**
 * A translation has every English key, all strings. Languages whose plural rules have a
 * `many` form (es, fr, pt-PT) add `<key>_many` beside each `<key>_other`.
 */
export type Messages<T = typeof en> = {
  [K in keyof T]: T[K] extends string ? string : Messages<T[K]>;
} & {
  [K in keyof T as K extends `${infer Base}_other` ? `${Base}_many` : never]?: string;
};
