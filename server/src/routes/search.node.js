import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import express from 'express';
import { searchRouter } from './search.js';

// Only requests to TMDb are answered by the stub; searches here are limited to movie and tv.
const realFetch = globalThis.fetch;
let server;
let baseUrl;
let tmdbUrls;
let originalApiKey;

before(async () => {
  server = express().use('/api/search', searchRouter).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/search`;
});

after(() => server.close());

beforeEach(() => {
  tmdbUrls = [];
  originalApiKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = 'secret-tmdb-key';
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.hostname !== 'api.themoviedb.org') return realFetch(input, init);
    tmdbUrls.push(url);
    return { ok: true, json: async () => ({ results: [] }) };
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (originalApiKey === undefined) delete process.env.TMDB_API_KEY;
  else process.env.TMDB_API_KEY = originalApiKey;
});

const languages = () => tmdbUrls.map((url) => url.searchParams.get('language'));

test('searches TMDb in the requested language', async () => {
  await fetch(`${baseUrl}?q=dune&type=movie&lang=fr`);
  await fetch(`${baseUrl}?q=dune&type=tv&lang=es`);
  await fetch(`${baseUrl}?q=genre:drama&type=movie&lang=pt-PT`);
  assert.equal(languages()[0], 'fr-FR');
  assert.equal(languages()[1], 'es-ES');
  assert.ok(languages().length > 2);
  assert.ok(languages().slice(2).every((language) => language === 'pt-PT'));
});

test('falls back to English for a missing, invalid, or repeated language, and never forwards it', async () => {
  for (const query of ['', '&lang=', '&lang=zz', '&lang=fr&lang=es', '&lang[]=fr', '&lang=en-US%0d%0a']) {
    const res = await fetch(`${baseUrl}?q=dune&type=movie${query}`);
    assert.equal(res.status, 200, query);
  }
  assert.equal(tmdbUrls.length, 6);
  assert.deepEqual([...new Set(languages())], ['en-US']);
  assert.ok(tmdbUrls.every((url) => !url.search.includes('zz')));
});
