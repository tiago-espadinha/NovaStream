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

const dataWrites = {
  'saved media': (stale) => ({ ...stale, savedMedia: [{ id: 'm1', title: 'Dune' }] }),
  collections: (stale) => ({ ...stale, collections: { custom: [], assignments: {}, media: {} } }),
  preferences: (stale) => ({ ...stale, preferences: { favoriteGenres: [], theme: 'light' } }),
};

for (const [name, makeBackend] of Object.entries(backends)) {
  for (const [kind, write] of Object.entries(dataWrites)) {
    test(`${name}: a ${kind} write that read the user before a password change keeps the new password`, async () => {
      const backend = makeBackend();
      const store = createStore(backend);
      await store.createUser(user());
      const stale = await backend.getUser('u1');
      await store.updateCredentials('u1', { passwordHash: 'hash2', sessionVersion: 1 });
      await backend.putUser(write(stale));
      assert.deepEqual(await store.findUserById('u1'), { ...write(stale), passwordHash: 'hash2', sessionVersion: 1 });
    });
  }

  test(`${name}: a password change keeps the user's data`, async () => {
    const store = createStore(makeBackend());
    await store.createUser(user());
    await store.addSavedMedia('u1', { id: 'm1', title: 'Dune' });
    const updated = await store.updateCredentials('u1', { passwordHash: 'hash2', sessionVersion: 1 });
    assert.equal(updated.savedMedia.length, 1);
    assert.equal(updated.passwordHash, 'hash2');
    assert.deepEqual(await store.findUserById('u1'), updated);
  });

  test(`${name}: data updates can't change the password hash or session version`, async () => {
    const store = createStore(makeBackend());
    await store.createUser(user({ sessionVersion: 2 }));
    const updated = await store.updateUser('u1', { name: 'Ada L', passwordHash: 'forged', sessionVersion: 0 });
    assert.deepEqual(await store.findUserById('u1'), updated);
    assert.equal(updated.name, 'Ada L');
    assert.equal(updated.passwordHash, 'hash');
    assert.equal(updated.sessionVersion, 2);
  });

  test(`${name}: changing the credentials of a missing user stores nothing`, async () => {
    const store = createStore(makeBackend());
    assert.equal(await store.updateCredentials('missing', { passwordHash: 'h', sessionVersion: 1 }), null);
    assert.equal(await store.findUserById('missing'), null);
  });
}

const redisStore = (fetchImpl) => createStore(createRedisBackend({ url: 'https://redis.test', token: 't', fetchImpl }));
const stored = (upstash, key) => JSON.parse(upstash.data.get(key));

// Runs `hook` once, just before the first command matching `when` reaches the fake.
function interleave(upstash, when, hook) {
  let pending = true;
  return async (url, init) => {
    if (pending && when(JSON.parse(init.body))) {
      pending = false;
      await hook();
    }
    return upstash.fetchImpl(url, init);
  };
}

test('redis: the password and session version are kept apart from the user data', async () => {
  const upstash = fakeUpstash();
  const store = redisStore(upstash.fetchImpl);
  await store.createUser(user({ sessionVersion: 1 }));
  await store.addSavedMedia('u1', { id: 'm1', title: 'Dune' });
  assert.equal('passwordHash' in stored(upstash, 'user:u1'), false);
  assert.equal('sessionVersion' in stored(upstash, 'user:u1'), false);
  assert.deepEqual(stored(upstash, 'user-auth:u1'), { passwordHash: 'hash', sessionVersion: 1 });
});

test('redis: an account stored before the auth key still signs in and moves over on its next write', async () => {
  const upstash = fakeUpstash();
  const store = redisStore(upstash.fetchImpl);
  upstash.data.set('user:u1', JSON.stringify(user({ sessionVersion: 2 })));
  upstash.data.set('user-email:ada@example.com', 'u1');

  const found = await store.findUserByEmail('ada@example.com');
  assert.equal(found.passwordHash, 'hash');
  assert.equal(found.sessionVersion, 2);

  await store.addSavedMedia('u1', { id: 'm1', title: 'Dune' });
  assert.deepEqual(stored(upstash, 'user-auth:u1'), { passwordHash: 'hash', sessionVersion: 2 });
  assert.equal('passwordHash' in stored(upstash, 'user:u1'), false);
  const moved = await store.findUserById('u1');
  assert.equal(moved.passwordHash, 'hash');
  assert.equal(moved.sessionVersion, 2);
  assert.equal(moved.savedMedia.length, 1);
});

test('redis: an older account that changes password before any data write keeps the new one', async () => {
  const upstash = fakeUpstash();
  const backend = createRedisBackend({ url: 'https://redis.test', token: 't', fetchImpl: upstash.fetchImpl });
  const store = createStore(backend);
  upstash.data.set('user:u1', JSON.stringify(user()));
  const stale = await backend.getUser('u1');
  await store.updateCredentials('u1', { passwordHash: 'hash2', sessionVersion: 1 });
  await backend.putUser({ ...stale, savedMedia: [{ id: 'm1', title: 'Dune' }] });
  const saved = await store.findUserById('u1');
  assert.equal(saved.passwordHash, 'hash2');
  assert.equal(saved.sessionVersion, 1);
  assert.equal(saved.savedMedia.length, 1);
});

test('redis: a password change landing inside a save keeps the new password', async () => {
  const upstash = fakeUpstash();
  let store;
  const fetchImpl = interleave(
    upstash,
    ([cmd, key]) => cmd === 'SET' && key === 'user:u1',
    () => store.updateCredentials('u1', { passwordHash: 'hash2', sessionVersion: 1 }),
  );
  store = redisStore(fetchImpl);
  upstash.data.set('user:u1', JSON.stringify(user()));
  await store.addSavedMedia('u1', { id: 'm1', title: 'Dune' });
  const saved = await store.findUserById('u1');
  assert.equal(saved.passwordHash, 'hash2');
  assert.equal(saved.sessionVersion, 1);
  assert.equal(saved.savedMedia.length, 1);
});

test('redis: a data write racing a deletion leaves no keys behind', async () => {
  const upstash = fakeUpstash();
  const backend = createRedisBackend({ url: 'https://redis.test', token: 't', fetchImpl: upstash.fetchImpl });
  const store = createStore(backend);
  await store.createUser(user());
  const stale = await backend.getUser('u1');
  await store.deleteUser('u1');
  await backend.putUser({ ...stale, savedMedia: [{ id: 'm1', title: 'Dune' }] });
  assert.deepEqual([...upstash.data.keys()], []);
});

test('redis: a password change racing a deletion leaves no keys behind', async () => {
  const upstash = fakeUpstash();
  let store;
  const fetchImpl = interleave(upstash, ([cmd]) => cmd === 'EXISTS', () => store.deleteUser('u1'));
  store = redisStore(fetchImpl);
  await store.createUser(user());
  assert.equal(await store.updateCredentials('u1', { passwordHash: 'hash2', sessionVersion: 1 }), null);
  assert.deepEqual([...upstash.data.keys()], []);
});

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
  assert.deepEqual(JSON.parse(upstash.calls.at(-1).body), ['DEL', 'user:u1', 'user-email:ada@example.com', 'user-auth:u1']);
  assert.deepEqual([...upstash.data.keys()].sort(), ['user-auth:u2', 'user-email:grace@example.com', 'user:u2']);
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
  assert.deepEqual(JSON.parse(upstash.calls[0].body), ['MGET', 'user:u1', 'user-auth:u1']);
});

test('redis: surfaces errors from the REST API', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: 'WRONGPASS' }) });
  const store = createStore(createRedisBackend({ url: 'https://redis.test', token: 'bad', fetchImpl }));
  await assert.rejects(store.findUserById('u1'), /WRONGPASS/);
});
