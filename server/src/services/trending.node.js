import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderError } from './providerError.js';
import { createTrendingFeed } from './trending.js';

const quiet = () => {};
const items = (type, count) =>
  Array.from({ length: count }, (_, i) => ({ id: `${type}-${i + 1}`, title: `${type} ${i + 1}`, type }));

test('returns { results, errors } with a few items per type, interleaved in provider order', async () => {
  const getTrending = createTrendingFeed(
    { movie: async () => items('movie', 6), book: async () => items('book', 2) },
    { log: quiet },
  );
  const response = await getTrending();
  assert.deepEqual(Object.keys(response), ['results', 'errors']);
  assert.deepEqual(
    response.results.map((item) => item.id),
    ['movie-1', 'book-1', 'movie-2', 'book-2', 'movie-3', 'movie-4'],
  );
  assert.deepEqual(response.errors, []);
});

test('a failing provider is reported by type and code while the others still trend', async () => {
  const getTrending = createTrendingFeed(
    {
      movie: async () => items('movie', 1),
      game: async () => {
        throw new ProviderError('not_configured', 'RAWG_API_KEY is not set — secret hint');
      },
      music: async () => items('music', 1),
    },
    { log: quiet },
  );
  const { results, errors } = await getTrending();
  assert.deepEqual(results.map((item) => item.type), ['movie', 'music']);
  assert.deepEqual(errors, [{ type: 'game', code: 'not_configured' }]);
  assert.equal(JSON.stringify(errors).includes('RAWG_API_KEY'), false, 'raw message must not reach the client');
});

test('a hanging provider times out without blocking the others', async () => {
  const getTrending = createTrendingFeed(
    { movie: async () => items('movie', 1), tv: () => new Promise(() => {}) },
    { timeoutMs: 50, log: quiet },
  );
  const { results, errors } = await getTrending();
  assert.deepEqual(results.map((item) => item.id), ['movie-1']);
  assert.deepEqual(errors, [{ type: 'tv', code: 'timeout' }]);
});

test('serves cached lists until the TTL passes, then refetches', async () => {
  let clock = 0;
  let calls = 0;
  const getTrending = createTrendingFeed(
    { movie: async () => items('movie', ++calls) },
    { ttlMs: 1000, now: () => clock, log: quiet },
  );
  await getTrending();
  clock = 999;
  await getTrending();
  assert.equal(calls, 1);
  clock = 1001;
  const { results } = await getTrending();
  assert.equal(calls, 2);
  assert.equal(results.length, 2);
});

test('concurrent requests share one provider call', async () => {
  let calls = 0;
  const getTrending = createTrendingFeed(
    { movie: async () => (calls += 1, items('movie', 1)) },
    { log: quiet },
  );
  await Promise.all([getTrending(), getTrending(), getTrending()]);
  assert.equal(calls, 1);
});

test('failures are not cached, so the next request retries the provider', async () => {
  let calls = 0;
  const getTrending = createTrendingFeed(
    {
      movie: async () => {
        calls += 1;
        if (calls === 1) throw new ProviderError('unavailable', 'TMDb request failed: 503');
        return items('movie', 1);
      },
    },
    { log: quiet },
  );
  assert.deepEqual((await getTrending()).errors, [{ type: 'movie', code: 'unavailable' }]);
  const retry = await getTrending();
  assert.equal(calls, 2);
  assert.deepEqual(retry.errors, []);
  assert.deepEqual(retry.results.map((item) => item.id), ['movie-1']);
});

test('a timed-out provider is retried on the next request instead of staying stuck', async () => {
  let calls = 0;
  const getTrending = createTrendingFeed(
    { tv: () => (++calls === 1 ? new Promise(() => {}) : Promise.resolve(items('tv', 1))) },
    { timeoutMs: 50, log: quiet },
  );
  assert.deepEqual((await getTrending()).errors, [{ type: 'tv', code: 'timeout' }]);
  // The cache's own timeout starts just after the response's, so let it expire too.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual((await getTrending()).results.map((item) => item.id), ['tv-1']);
});
