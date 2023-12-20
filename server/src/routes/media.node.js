import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import express from 'express';
import { createDeezerClient, deezer as defaultDeezer } from '../services/deezer.js';
import { setDeezerClient } from '../services/lastfm.js';
import { ProviderError } from '../services/providerError.js';
import { failureResponse, mediaRouter, parseSeasonParams } from './media.js';

test('maps each provider error code to an HTTP status with client-safe copy', () => {
  const cases = { not_found: 404, timeout: 504, not_configured: 503, unavailable: 502 };
  for (const [code, status] of Object.entries(cases)) {
    const response = failureResponse(new ProviderError(code, `raw upstream detail for ${code}`));
    assert.equal(response.status, status);
    assert.equal(response.body.code, code);
    assert.equal(response.body.error.includes('raw upstream'), false);
  }
});

test('treats unknown errors as unavailable without echoing their message', () => {
  const response = failureResponse(new Error('TMDb request failed: 401 Unauthorized'));
  assert.deepEqual(response, {
    status: 502,
    body: { error: 'The source couldn’t be reached.', code: 'unavailable' },
  });
});

test('accepts digit-only series ids and season numbers from 0 to 999', () => {
  assert.deepEqual(parseSeasonParams({ id: '1', season: '0' }), { id: '1', season: 0 });
  assert.deepEqual(parseSeasonParams({ id: '1234567890', season: '999' }), { id: '1234567890', season: 999 });
});

test('rejects malformed series ids and season numbers', () => {
  const badIds = ['', 'abc', '12345678901', '1e3', '-1', '1.5', '..', '12/../x'];
  const badSeasons = ['', '-1', '1.5', '1e2', '0x10', ' 1', '+1', '1000', 'abc', '01'];
  for (const id of badIds) assert.equal(parseSeasonParams({ id, season: '1' }), null, `id ${JSON.stringify(id)}`);
  for (const season of badSeasons) {
    assert.equal(parseSeasonParams({ id: '1', season }), null, `season ${JSON.stringify(season)}`);
  }
});

// Route tests run the real router; only requests to TMDb are answered by the stub.
const realFetch = globalThis.fetch;
let server;
let baseUrl;
let tmdbCalls;
let tmdbReply;
let originalApiKey;
let originalWarn;

before(async () => {
  const app = express().use('/api/media', mediaRouter);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/media`;
});

after(() => server.close());

beforeEach(() => {
  tmdbCalls = [];
  tmdbReply = { ok: true, json: async () => ({}) };
  originalApiKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = 'secret-tmdb-key';
  originalWarn = console.warn;
  console.warn = () => {};
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.hostname !== 'api.themoviedb.org') return realFetch(input, init);
    tmdbCalls.push(url.pathname);
    return tmdbReply;
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.warn = originalWarn;
  if (originalApiKey === undefined) delete process.env.TMDB_API_KEY;
  else process.env.TMDB_API_KEY = originalApiKey;
});

test('serves one season of episodes from TMDb', async () => {
  tmdbReply = {
    ok: true,
    json: async () => ({ name: 'Season 1', episodes: [{ episode_number: 1, name: 'Pilot', air_date: '2020-03-01' }] }),
  };

  const res = await fetch(`${baseUrl}/tv/42/season/1`);

  assert.equal(res.status, 200);
  assert.deepEqual(tmdbCalls, ['/3/tv/42/season/1']);
  assert.deepEqual(await res.json(), {
    number: 1,
    name: 'Season 1',
    episodes: [{ number: 1, title: 'Pilot', airDate: '2020-03-01' }],
  });
});

test('rejects a bad season request without calling TMDb', async () => {
  for (const path of ['tv/abc/season/1', 'tv/42/season/-1', 'tv/42/season/01', 'tv/42/season/1.5']) {
    const res = await fetch(`${baseUrl}/${path}`);
    assert.equal(res.status, 400, path);
  }
  assert.deepEqual(tmdbCalls, []);
});

test('reports a missing season and upstream failures without leaking the key', async () => {
  tmdbReply = { ok: false, status: 404, statusText: 'Not Found' };
  const missing = await fetch(`${baseUrl}/tv/42/season/9`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, 'not_found');

  tmdbReply = { ok: false, status: 401, statusText: 'Unauthorized' };
  const failed = await fetch(`${baseUrl}/tv/42/season/1`);
  const body = await failed.text();
  assert.equal(failed.status, 502);
  assert.equal(body.includes('secret-tmdb-key'), false);

  delete process.env.TMDB_API_KEY;
  assert.equal((await fetch(`${baseUrl}/tv/42/season/1`)).status, 503);
});

test('keeps the series detail route working beside the season route', async () => {
  tmdbReply = { ok: true, json: async () => ({ id: 42, name: 'Example Show', 'watch/providers': { results: {} } }) };

  const res = await fetch(`${baseUrl}/tv/42`);

  assert.equal(res.status, 200);
  assert.deepEqual(tmdbCalls, ['/3/tv/42']);
  assert.equal((await res.json()).title, 'Example Show');
});

test("serves an artist's albums and refuses ids that aren't an artist", async (t) => {
  const originalLastfmKey = process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY = 'test';
  // Deezer has nothing for this album, without the lookup reaching the network.
  setDeezerClient(createDeezerClient({ fetch: async () => ({ ok: true, json: async () => ({ data: [] }) }) }));
  t.after(() => {
    setDeezerClient(defaultDeezer);
    if (originalLastfmKey === undefined) delete process.env.LASTFM_API_KEY;
    else process.env.LASTFM_API_KEY = originalLastfmKey;
  });
  const artists = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.hostname !== 'ws.audioscrobbler.com') return realFetch(input, init);
    artists.push(url.searchParams.get('artist'));
    return { ok: true, json: async () => ({ topalbums: { album: [{ name: 'First Record', playcount: '9000' }] } }) };
  };
  const artistId = encodeURIComponent('artist|||AC/DC');

  const res = await fetch(`${baseUrl}/music/${artistId}/albums`);

  assert.equal(res.status, 200);
  assert.deepEqual(artists, ['AC/DC']);
  assert.deepEqual((await res.json()).albums.map((album) => [album.title, album.artist]), [['First Record', 'AC/DC']]);

  const notArtist = await fetch(`${baseUrl}/music/${encodeURIComponent('album|||AC/DC|||Back in Black')}/albums`);
  assert.equal(notArtist.status, 404);
  assert.equal(artists.length, 1);
});
