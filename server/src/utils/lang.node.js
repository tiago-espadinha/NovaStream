import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLang, TMDB_LANGUAGES } from './lang.js';

test('accepts each supported locale', () => {
  for (const lang of Object.keys(TMDB_LANGUAGES)) assert.equal(parseLang(lang), lang);
});

test('falls back to English for missing, repeated, or unknown values', () => {
  const bad = [undefined, null, '', 'EN', 'fr-FR', 'pt', 'de', ['fr', 'es'], ['fr'], {}, 5, '__proto__', 'constructor', 'toString'];
  for (const value of bad) assert.equal(parseLang(value), 'en', JSON.stringify(value));
});
