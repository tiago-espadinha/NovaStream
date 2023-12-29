import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryCounters } from '../db/attempts.js';
import { createSignUpAttempts } from './signUpAttempts.js';

const make = (counters = createMemoryCounters()) => createSignUpAttempts({ counters, ipMax: 2, windowSeconds: 60 });

test('admits an IP up to its maximum sign-ups, then answers the seconds left', async () => {
  const attempts = make();
  assert.equal(await attempts.admit('1.1.1.1'), 0);
  assert.equal(await attempts.admit('1.1.1.1'), 0);
  assert.equal(await attempts.admit('1.1.1.1'), 60);
  assert.equal(await attempts.admit('2.2.2.2'), 0);
});

test('counts every address in an IPv6 /64 as one IP', async () => {
  const attempts = make();
  assert.equal(await attempts.admit('2001:db8:1:2::1'), 0);
  assert.equal(await attempts.admit('2001:db8:1:2:ffff::9'), 0);
  assert.equal(await attempts.admit('2001:db8:1:2::abcd'), 60);
  assert.equal(await attempts.admit('2001:db8:1:3::1'), 0);
});

test('lets sign-ups through when the counters are unreachable', async (t) => {
  t.mock.method(console, 'error', () => {});
  const attempts = make({
    hit: async () => {
      throw new Error('Redis /multi-exec failed: 503');
    },
  });
  for (let i = 0; i < 3; i++) assert.equal(await attempts.admit('1.1.1.1'), 0);
  assert.equal(console.error.mock.callCount(), 3);
});
