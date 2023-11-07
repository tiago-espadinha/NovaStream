import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderError, upstreamFailure, withTimeout } from './providerError.js';
import { searchAcross } from './searchAcross.js';

const quiet = () => {};
const item = (type, n) => ({ id: `${type}-${n}`, title: `${type} ${n}`, type });

test('combines results from every provider that succeeds', async () => {
  const { results, errors } = await searchAcross(['movie', 'book'], async (type) => [item(type, 1)], { log: quiet });
  assert.deepEqual(results.map((r) => r.id), ['movie-1', 'book-1']);
  assert.deepEqual(errors, []);
});

test('keeps other providers when one fails, and reports only a type and code', async () => {
  const logged = [];
  const { results, errors } = await searchAcross(
    ['movie', 'game', 'book'],
    async (type) => {
      if (type === 'game') throw new ProviderError('not_configured', 'RAWG_API_KEY is not set — secret hint');
      return [item(type, 1)];
    },
    { log: (line) => logged.push(line) },
  );
  assert.deepEqual(results.map((r) => r.type), ['movie', 'book']);
  assert.deepEqual(errors, [{ type: 'game', code: 'not_configured' }]);
  assert.equal(JSON.stringify(errors).includes('RAWG_API_KEY'), false, 'raw message must not reach the client');
  assert.match(logged[0], /game failed \(not_configured\)/);
});

test('a provider that hangs times out without blocking the others', async () => {
  const started = Date.now();
  const { results, errors } = await searchAcross(
    ['movie', 'music'],
    (type) => (type === 'music' ? new Promise(() => {}) : Promise.resolve([item(type, 1)])),
    { timeoutMs: 50, log: quiet },
  );
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(results.map((r) => r.id), ['movie-1']);
  assert.deepEqual(errors, [{ type: 'music', code: 'timeout' }]);
});

test('synchronous throws and unknown errors are reported as unavailable', async () => {
  const { errors } = await searchAcross(
    ['tv'],
    () => {
      throw new Error('boom');
    },
    { log: quiet },
  );
  assert.deepEqual(errors, [{ type: 'tv', code: 'unavailable' }]);
});

test('upstreamFailure maps 404 to not_found and other statuses to unavailable', () => {
  assert.equal(upstreamFailure('TMDb', { status: 404, statusText: 'Not Found' }).code, 'not_found');
  assert.equal(upstreamFailure('TMDb', { status: 503, statusText: 'Service Unavailable' }).code, 'unavailable');
});

test('withTimeout passes through a value that arrives in time', async () => {
  assert.equal(await withTimeout(() => Promise.resolve('ok'), 50, 'quick'), 'ok');
});
