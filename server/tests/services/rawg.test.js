import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { ProviderError } from '../../src/services/providerError.js';
import {
  getGameDetail,
  searchGames,
  searchGamesByGenre,
  searchGamesByTag,
  trendingGames,
} from '../../src/services/rawg.js';

const realFetch = globalThis.fetch;
let originalKey;
let requests;
let respond;

const game = (overrides = {}) => ({
  id: 1,
  name: 'Hades',
  rating: 4.5,
  genres: [{ name: 'Action' }],
  tags: [{ name: 'Roguelike' }, { name: '' }],
  released: '2020-09-17',
  background_image: 'https://img/hades.jpg',
  ...overrides,
});

const ok = (body) => ({ ok: true, json: async () => body });

beforeEach(() => {
  originalKey = process.env.RAWG_API_KEY;
  process.env.RAWG_API_KEY = 'secret-rawg-key';
  requests = [];
  respond = () => ok({ results: [] });
  globalThis.fetch = async (url) => {
    requests.push(url);
    return respond(url);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (originalKey === undefined) delete process.env.RAWG_API_KEY;
  else process.env.RAWG_API_KEY = originalKey;
});

test('sends the key and the search, and maps a game to the shared shape', async () => {
  respond = () => ok({ results: [game()] });
  const [result] = await searchGames('hades');

  assert.equal(requests[0].pathname, '/api/games');
  assert.equal(requests[0].searchParams.get('key'), 'secret-rawg-key');
  assert.equal(requests[0].searchParams.get('search'), 'hades');
  assert.deepEqual(result, {
    id: 'game-1',
    title: 'Hades',
    type: 'game',
    rating: 9,
    genres: ['Action'],
    tags: ['Roguelike'],
    releaseYear: 2020,
    posterUrl: 'https://img/hades.jpg',
  });
});

test('survives a game with almost nothing filled in', async () => {
  respond = () => ok({ results: [{ id: 2, name: 'Bare', rating: 3 }] });
  const [result] = await searchGames('bare');
  assert.deepEqual(result, {
    id: 'game-2',
    title: 'Bare',
    type: 'game',
    rating: 6,
    genres: [],
    tags: [],
    releaseYear: null,
    posterUrl: null,
  });
});

test('search leaves out games with no rating', async () => {
  respond = () => ok({ results: [game(), game({ id: 2, rating: 0 }), game({ id: 3, rating: null })] });
  assert.deepEqual(
    (await searchGames('x')).map(({ id }) => id),
    ['game-1'],
  );
});

test('an answer with no results is an empty list', async () => {
  respond = () => ok({});
  assert.deepEqual(await searchGames('x'), []);
});

test('fails as not configured without a key, sending nothing', async () => {
  delete process.env.RAWG_API_KEY;
  await assert.rejects(
    () => searchGames('x'),
    (err) => err instanceof ProviderError && err.code === 'not_configured',
  );
  assert.equal(requests.length, 0);
});

test('tells a missing game from an outage, without repeating the key', async () => {
  respond = () => ({ ok: false, status: 404, statusText: 'Not Found' });
  await assert.rejects(
    () => getGameDetail(9),
    (err) => err.code === 'not_found' && !err.message.includes('secret-rawg-key'),
  );

  respond = () => ({ ok: false, status: 500, statusText: 'Server Error' });
  await assert.rejects(
    () => searchGames('x'),
    (err) => err.code === 'unavailable',
  );
});

test('trending asks for the last 30 days by adds, and keeps new unrated games as unrated', async () => {
  respond = () => ok({ results: [game(), game({ id: 2, rating: 0 })] });
  const results = await trendingGames();

  const params = requests[0].searchParams;
  assert.equal(params.get('ordering'), '-added');
  const [since, until] = params.get('dates').split(',');
  assert.equal((new Date(until) - new Date(since)) / (24 * 60 * 60 * 1000), 30);
  assert.deepEqual(
    results.map(({ id, rating }) => [id, rating]),
    [
      ['game-1', 9],
      ['game-2', null],
    ],
  );
});

test('a genre search resolves names to ids, keeping only real matches', async () => {
  respond = (url) =>
    url.pathname === '/api/genres'
      ? ok({
          results: [
            { id: 4, name: 'Action', slug: 'action' },
            { id: 5, name: 'Puzzle', slug: 'puzzle' },
            { id: 6, name: 'Action RPG', slug: 'action-rpg' },
          ],
        })
      : ok({ results: [game(), game({ id: 2, rating: 0 })] });

  const results = await searchGamesByGenre('Action');
  assert.equal(requests[1].pathname, '/api/games');
  assert.equal(requests[1].searchParams.get('genres'), '4,6');
  assert.equal(requests[1].searchParams.get('ordering'), '-rating');
  assert.deepEqual(
    results.map(({ id }) => id),
    ['game-1'],
  );
});

test('a genre nobody matches is an empty list, with no games request', async () => {
  respond = () => ok({ results: [{ id: 5, name: 'Puzzle', slug: 'puzzle' }] });
  assert.deepEqual(await searchGamesByGenre('Action'), []);
  assert.equal(requests.length, 1);
});

test('a tag search falls back to genres when no tag has games', async () => {
  respond = (url) => {
    if (url.pathname === '/api/tags') return ok({ results: [] });
    if (url.pathname === '/api/genres') return ok({ results: [{ id: 4, name: 'Indie', slug: 'indie' }] });
    return ok({ results: [game()] });
  };
  const results = await searchGamesByTag('Indie');
  assert.deepEqual(
    requests.map(({ pathname }) => pathname),
    ['/api/tags', '/api/genres', '/api/games'],
  );
  assert.equal(results[0].id, 'game-1');
});

test('a tag search stops at the tag when it has games', async () => {
  respond = (url) =>
    url.pathname === '/api/tags'
      ? ok({ results: [{ id: 7, name: 'Indie', slug: 'indie' }] })
      : ok({ results: [game()] });
  await searchGamesByTag('Indie');
  assert.equal(requests.at(-1).searchParams.get('tags'), '7');
  assert.equal(requests.length, 2);
});

test('maps a full detail, preferring the developer over the publisher', async () => {
  respond = () =>
    ok({
      ...game(),
      description_raw: '  A roguelike.  ',
      playtime: 20,
      developers: [{ name: 'Supergiant' }],
      publishers: [{ name: 'Someone' }],
      platforms: [{ platform: { name: 'PC' } }],
    });
  const detail = await getGameDetail(1);

  assert.equal(requests[0].pathname, '/api/games/1');
  assert.equal(detail.overview, 'A roguelike.');
  assert.deepEqual(detail.length, { kind: 'playtime', hours: 20 });
  assert.equal(detail.creatorRole, 'studio');
  assert.equal(detail.creator, 'Supergiant');
  assert.deepEqual(detail.platforms, ['PC']);
});

test('a detail falls back to the publisher, and to nothing', async () => {
  respond = () => ok({ ...game(), publishers: [{ name: 'Someone' }] });
  assert.equal((await getGameDetail(1)).creator, 'Someone');

  respond = () => ok({ id: 1, name: 'Bare' });
  const bare = await getGameDetail(1);
  assert.equal(bare.creator, null);
  assert.equal(bare.overview, '');
  assert.equal(bare.length, null);
  assert.deepEqual(bare.platforms, []);
});
