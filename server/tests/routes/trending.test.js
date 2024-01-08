import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import express from 'express';
import { trendingRouter } from '../../src/routes/trending.js';

// Runs the real feed behind the route, so only provider requests are stubbed. The feed caches
// each language it has seen, which these tests rely on to observe one TMDb request per language.
const realFetch = globalThis.fetch;
const KEYS = ['TMDB_API_KEY', 'LASTFM_API_KEY', 'RAWG_API_KEY'];
let server;
let baseUrl;
let tmdbLanguages;
let originalEnv;

before(async () => {
  server = express().use('/api/trending', trendingRouter).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/trending`;
});

after(() => server.close());

beforeEach(() => {
  originalEnv = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  process.env.TMDB_API_KEY = 'secret-tmdb-key';
  delete process.env.LASTFM_API_KEY;
  delete process.env.RAWG_API_KEY;
  tmdbLanguages = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.hostname === '127.0.0.1') return realFetch(input, init);
    if (url.hostname === 'api.themoviedb.org') {
      tmdbLanguages.push(url.searchParams.get('language'));
      return { ok: true, json: async () => ({ results: [] }) };
    }
    return { ok: false, status: 503, statusText: 'Unavailable' };
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const key of KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

test('answers with the same shape as search, one error per source that did not answer', async () => {
  const res = await fetch(`${baseUrl}?lang=es`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.deepEqual(body.results, []);
  assert.deepEqual(body.errors.map(({ type }) => type).sort(), ['book', 'game', 'music']);
  assert.equal(body.errors.find(({ type }) => type === 'game').code, 'not_configured');
  assert.equal(body.errors.find(({ type }) => type === 'book').code, 'unavailable');
});

test('asks TMDb in the viewer’s language', async () => {
  await fetch(`${baseUrl}?lang=fr`);
  assert.deepEqual([...new Set(tmdbLanguages)], ['fr-FR']);
});

test('uses English for a missing, unknown or repeated language', async () => {
  await fetch(baseUrl);
  assert.deepEqual([...new Set(tmdbLanguages)], ['en-US']);

  // Already cached by the request above: unknown values must land on that same English entry.
  tmdbLanguages = [];
  await fetch(`${baseUrl}?lang=klingon`);
  await fetch(`${baseUrl}?lang=fr&lang=es`);
  assert.deepEqual(tmdbLanguages, []);
});
