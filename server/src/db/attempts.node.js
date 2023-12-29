import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryCounters, createRedisCounters } from './attempts.js';
import { fakeUpstash } from './fakeUpstash.js';

function clock() {
  let ms = 1_000_000;
  return { now: () => ms, advance: (seconds) => { ms += seconds * 1000; } };
}

const redisCounters = (upstash) =>
  createRedisCounters({ url: 'https://redis.test', token: 't', fetchImpl: upstash.fetchImpl });

const backends = {
  memory: ({ now }) => createMemoryCounters({ now }),
  redis: ({ now }) => redisCounters(fakeUpstash({ now })),
};

for (const [name, makeCounters] of Object.entries(backends)) {
  test(`${name}: counts hits per key`, async () => {
    const counters = makeCounters(clock());
    assert.equal((await counters.hit('a', 60)).count, 1);
    assert.equal((await counters.hit('a', 60)).count, 2);
    assert.equal((await counters.hit('b', 60)).count, 1);
  });

  test(`${name}: the window runs from the first hit and is not extended`, async () => {
    const time = clock();
    const counters = makeCounters(time);
    assert.deepEqual(await counters.hit('a', 60), { count: 1, secondsLeft: 60 });
    time.advance(40);
    assert.deepEqual(await counters.hit('a', 60), { count: 2, secondsLeft: 20 });
    time.advance(20);
    assert.deepEqual(await counters.hit('a', 60), { count: 1, secondsLeft: 60 });
  });

  test(`${name}: undo takes back one hit and clear resets one key only`, async () => {
    const counters = makeCounters(clock());
    await counters.hit('a', 60);
    await counters.hit('a', 60);
    await counters.undo('a');
    assert.equal((await counters.hit('a', 60)).count, 2);
    await counters.hit('b', 60);
    await counters.clear('a');
    assert.equal((await counters.hit('a', 60)).count, 1);
    assert.equal((await counters.hit('b', 60)).count, 2);
  });
}

test('redis: separate instances share one count, as serverless invocations do', async () => {
  const upstash = fakeUpstash({ now: clock().now });
  await redisCounters(upstash).hit('a', 60);
  assert.equal((await redisCounters(upstash).hit('a', 60)).count, 2);
});

test('redis: a counter left without a TTL gets one on the next hit', async () => {
  const time = clock();
  const upstash = fakeUpstash({ now: time.now });
  upstash.data.set('a', '5');
  const counters = redisCounters(upstash);
  assert.deepEqual(await counters.hit('a', 60), { count: 6, secondsLeft: 60 });
  time.advance(60);
  assert.equal((await counters.hit('a', 60)).count, 1);
});

test('redis: a failed command inside the transaction is an error, not a count', async () => {
  const counters = createRedisCounters({
    url: 'https://redis.test',
    token: 't',
    fetchImpl: async () => ({ ok: true, json: async () => [{ result: 1 }, { error: 'ERR syntax error' }, { result: 60 }] }),
  });
  await assert.rejects(counters.hit('a', 60), /ERR syntax error/);
});
