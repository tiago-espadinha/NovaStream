import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createFileBackend, createRedisBackend, createStore } from './store.js';
import { fakeUpstash } from './fakeUpstash.js';

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

  test(`${name}: deletes a user with their data and frees the email`, async () => {
    const store = createStore(makeBackend());
    await store.createUser(user());
    await store.createUser(user({ id: 'u2', email: 'grace@example.com', name: 'Grace' }));
    await store.addSavedMedia('u1', { id: 'm1', title: 'Dune' });
    await store.updateUser('u1', { collections: { custom: [], assignments: {}, media: {} } });

    assert.equal(await store.deleteUser('u1'), true);
    assert.equal(await store.findUserById('u1'), null);
    assert.equal(await store.findUserByEmail('ADA@example.com'), null);
    assert.equal(await store.deleteUser('u1'), false);
    assert.equal(await store.deleteUser('missing'), false);

    assert.equal((await store.findUserById('u2')).name, 'Grace');
    assert.equal((await store.findUserByEmail('grace@example.com')).id, 'u2');

    const again = user({ id: 'u3', email: 'ada@example.com' });
    assert.deepEqual(await store.createUser(again), again);
    assert.deepEqual((await store.findUserById('u3')).savedMedia, []);
  });
}

for (const [name, makeBackend] of Object.entries(backends)) {
  test(`${name}: a write that lands after a deletion does not bring the user back`, async () => {
    const backend = makeBackend();
    const store = createStore(backend);
    await store.createUser(user());
    const stale = await backend.getUser('u1');
    await store.deleteUser('u1');
    await backend.putUser({ ...stale, savedMedia: [{ id: 'm1', title: 'Dune' }] });
    assert.equal(await store.findUserById('u1'), null);
  });
}

test('file: deleting a user leaves no trace of them in the file', async () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nova-store-')), 'data.json');
  const store = createStore(createFileBackend(dbPath));
  await store.createUser(user({ savedMedia: [{ id: 'm1', title: 'Dune' }] }));
  await store.deleteUser('u1');
  const raw = fs.readFileSync(dbPath, 'utf-8');
  assert.deepEqual(JSON.parse(raw), { users: [] });
});

test('redis: deletes the record and the email index in one command', async () => {
  const upstash = fakeUpstash();
  const store = createStore(createRedisBackend({ url: 'https://redis.test', token: 't', fetchImpl: upstash.fetchImpl }));
  await store.createUser(user());
  await store.createUser(user({ id: 'u2', email: 'grace@example.com' }));
  await store.deleteUser('u1');
  assert.deepEqual(JSON.parse(upstash.calls.at(-1).body), ['DEL', 'user:u1', 'user-email:ada@example.com']);
  assert.deepEqual([...upstash.data.keys()].sort(), ['user-email:grace@example.com', 'user:u2']);
});

test('redis: a failed delete rejects instead of reporting success', async () => {
  const upstash = fakeUpstash();
  const fetchImpl = async (url, init) =>
    JSON.parse(init.body)[0] === 'DEL'
      ? { ok: false, status: 500, json: async () => ({ error: 'ERR busy' }) }
      : upstash.fetchImpl(url, init);
  const store = createStore(createRedisBackend({ url: 'https://redis.test', token: 't', fetchImpl }));
  await store.createUser(user());
  await assert.rejects(store.deleteUser('u1'), /ERR busy/);
  assert.equal((await store.findUserById('u1')).id, 'u1');
});

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
