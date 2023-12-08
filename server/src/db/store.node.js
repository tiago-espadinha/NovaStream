import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createFileBackend, createRedisBackend, createStore } from './store.js';

// Answers GET/SET (with NX) the way Upstash's REST endpoint does, from an in-memory map.
function fakeUpstash() {
  const data = new Map();
  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(init);
    const [cmd, key, value, flag] = JSON.parse(init.body);
    let result = null;
    if (cmd === 'GET') result = data.get(key) ?? null;
    if (cmd === 'SET') {
      if (flag === 'NX' && data.has(key)) result = null;
      else {
        data.set(key, value);
        result = 'OK';
      }
    }
    return { ok: true, json: async () => ({ result }) };
  };
  return { data, calls, fetchImpl };
}

const user = (overrides = {}) => ({
  id: 'u1',
  email: 'Ada@Example.com',
  name: 'Ada',
  passwordHash: 'hash',
  preferences: { favoriteGenres: [], theme: 'dark' },
  savedMedia: [],
  ...overrides,
});

const backends = {
  file: () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-store-'));
    return createFileBackend(path.join(dir, 'data.json'));
  },
  redis: () => createRedisBackend({ url: 'https://redis.test', token: 't', fetchImpl: fakeUpstash().fetchImpl }),
};

for (const [name, makeBackend] of Object.entries(backends)) {
  test(`${name}: creates a user and finds it by id and case-insensitive email`, async () => {
    const store = createStore(makeBackend());
    assert.deepEqual(await store.createUser(user()), user());
    assert.equal((await store.findUserById('u1')).name, 'Ada');
    assert.equal((await store.findUserByEmail('ada@example.COM')).id, 'u1');
    assert.equal(await store.findUserById('missing'), null);
    assert.equal(await store.findUserByEmail('nobody@example.com'), null);
  });

  test(`${name}: refuses a second account with the same email`, async () => {
    const store = createStore(makeBackend());
    await store.createUser(user());
    assert.equal(await store.createUser(user({ id: 'u2', email: 'ada@example.com' })), null);
    assert.equal((await store.findUserByEmail('ada@example.com')).id, 'u1');
  });

  test(`${name}: updates, saves and removes media`, async () => {
    const store = createStore(makeBackend());
    await store.createUser(user());

    const updated = await store.updateUser('u1', { collections: { custom: [], assignments: {}, media: {} } });
    assert.deepEqual(updated.collections, { custom: [], assignments: {}, media: {} });
    assert.equal(await store.updateUser('missing', { name: 'x' }), null);

    await store.addSavedMedia('u1', { id: 'm1', title: 'Dune' });
    const saved = await store.addSavedMedia('u1', { id: 'm1', title: 'Dune' });
    assert.equal(saved.length, 1);
    assert.ok(saved[0].savedAt);
    assert.equal((await store.findUserById('u1')).savedMedia.length, 1);

    assert.deepEqual(await store.removeSavedMedia('u1', 'm1'), []);
    assert.equal(await store.addSavedMedia('missing', { id: 'm1' }), null);
    assert.equal(await store.removeSavedMedia('missing', 'm1'), null);
  });
}

test('redis: sends commands as an authorized JSON array', async () => {
  const upstash = fakeUpstash();
  const store = createStore(createRedisBackend({ url: 'https://redis.test', token: 'secret', fetchImpl: upstash.fetchImpl }));
  await store.findUserById('u1');
  assert.equal(upstash.calls[0].headers.Authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(upstash.calls[0].body), ['GET', 'user:u1']);
});

test('redis: surfaces errors from the REST API', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: 'WRONGPASS' }) });
  const store = createStore(createRedisBackend({ url: 'https://redis.test', token: 'bad', fetchImpl }));
  await assert.rejects(store.findUserById('u1'), /WRONGPASS/);
});
