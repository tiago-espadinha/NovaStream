import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import { fakeUpstash } from '../db/fakeUpstash.js';

// The routers use the app's store, which picks Redis when these are set. The fake answers
// those requests in memory, so no test reads or writes data.json. Both must be in place
// before the routers are imported, because the store is built at import time.
process.env.JWT_SECRET = 'test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
const upstash = fakeUpstash();
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) =>
  String(url) === process.env.UPSTASH_REDIS_REST_URL ? upstash.fetchImpl(url, init) : realFetch(url, init);

const { authRouter } = await import('./auth.js');
const { savedRouter } = await import('./saved.js');
const { collectionsRouter } = await import('./collections.js');
const { requireAuthConfig, signToken } = await import('../middleware/auth.js');
const { createUser, findUserById, updateUser } = await import('../db/store.js');
const { hashPassword, verifyPassword } = await import('../utils/password.js');

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', requireAuthConfig, authRouter);
  app.use('/api/saved', savedRouter);
  app.use('/api/collections', collectionsRouter);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  globalThis.fetch = realFetch;
});

beforeEach(() => upstash.data.clear());

const PASSWORD = 'correct horse';

async function seedUser(overrides = {}) {
  const user = {
    id: 'u1',
    email: 'ada@example.com',
    name: 'Ada',
    passwordHash: await hashPassword(PASSWORD),
    preferences: { favoriteGenres: [], theme: 'dark' },
    savedMedia: [{ id: 'm1', title: 'Dune', type: 'movie' }],
    collections: { custom: [], assignments: {}, media: {} },
    ...overrides,
  };
  await createUser(user);
  return user;
}

async function call(method, path, { token, body } = {}) {
  const res = await realFetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// Every route that needs a signed-in user; each must end the session for a stale token.
const accountRequests = [
  ['GET', '/api/auth/me'],
  ['PATCH', '/api/auth/preferences', { theme: 'light' }],
  ['GET', '/api/saved'],
  ['POST', '/api/saved', { id: 'm2', title: 'Arrival', type: 'movie' }],
  ['DELETE', '/api/saved/m1'],
  ['GET', '/api/collections'],
  ['PUT', '/api/collections', { custom: [], assignments: {}, media: {} }],
];

test('sign-in tokens carry the account session version', async () => {
  await seedUser({ sessionVersion: 3 });
  const { status, body } = await call('POST', '/api/auth/login', { body: { email: 'ada@example.com', password: PASSWORD } });
  assert.equal(status, 200);
  assert.equal((await call('GET', '/api/auth/me', { token: body.token })).status, 200);
});

test('tokens from before session versions still work for accounts that never changed password', async () => {
  await seedUser();
  const legacy = signToken({ sub: 'u1' });
  assert.equal((await call('GET', '/api/auth/me', { token: legacy })).status, 200);
});

test('a token older than the account session version is refused on every account route', async () => {
  await seedUser({ sessionVersion: 1 });
  const stale = signToken({ sub: 'u1', ver: 0 });
  for (const [method, path, body] of accountRequests) {
    const res = await call(method, path, { token: stale, body });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
  const user = await findUserById('u1');
  assert.equal(user.savedMedia.length, 1);
  assert.equal(user.preferences.theme, 'dark');
});

test('a token for a deleted account is refused on every account route without recreating it', async () => {
  const token = signToken({ sub: 'gone', ver: 0 });
  for (const [method, path, body] of accountRequests) {
    const res = await call(method, path, { token, body });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
  assert.equal(await findUserById('gone'), null);
  assert.equal(await updateUser('gone', { name: 'x' }), null);
});

const login = (password, email = 'ada@example.com') => call('POST', '/api/auth/login', { body: { email, password } });
const changePassword = (token, body) => call('PUT', '/api/auth/password', { token, body });

test('password change: requires a valid session', async () => {
  const { passwordHash } = await seedUser();
  const body = { currentPassword: PASSWORD, newPassword: 'brand new pass' };
  for (const token of [undefined, 'not-a-jwt', signToken({ sub: 'u1', ver: 1 }), signToken({ sub: 'gone' })]) {
    assert.equal((await changePassword(token, body)).status, 401);
  }
  assert.equal((await findUserById('u1')).passwordHash, passwordHash);
});

test('password change: swaps the password and signs out every other session', async () => {
  await seedUser();
  const otherDevice = signToken({ sub: 'u1', ver: 0 });
  const thisDevice = signToken({ sub: 'u1', ver: 0 });

  const res = await changePassword(thisDevice, { currentPassword: PASSWORD, newPassword: 'brand new pass' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, 'ada@example.com');
  assert.equal('passwordHash' in res.body.user, false);
  assert.equal('sessionVersion' in res.body.user, false);

  assert.equal((await call('GET', '/api/auth/me', { token: res.body.token })).status, 200);
  assert.equal((await call('GET', '/api/auth/me', { token: otherDevice })).status, 401);
  assert.equal((await login(PASSWORD)).status, 401);
  assert.equal((await login('brand new pass')).status, 200);
});

test('password change: a wrong current password is refused without ending the session', async () => {
  const { passwordHash } = await seedUser();
  const token = signToken({ sub: 'u1', ver: 0 });
  const res = await changePassword(token, { currentPassword: 'not my password', newPassword: 'brand new pass' });
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { error: 'That password isn’t right.', code: 'wrong_password' });
  assert.equal((await findUserById('u1')).passwordHash, passwordHash);
  assert.equal((await call('GET', '/api/auth/me', { token })).status, 200);
});

test('password change: a weak, oversized or unchanged new password is refused', async () => {
  const { passwordHash } = await seedUser();
  const token = signToken({ sub: 'u1', ver: 0 });
  const cases = {
    short: 'Password must be at least 8 characters.',
    ['é'.repeat(37)]: 'Password must be at most 72 characters.',
    [PASSWORD]: 'Choose a password different from your current one.',
  };
  for (const [newPassword, error] of Object.entries(cases)) {
    const res = await changePassword(token, { currentPassword: PASSWORD, newPassword });
    assert.deepEqual([res.status, res.body.error], [400, error]);
  }
  assert.equal((await changePassword(token, undefined)).status, 400);
  assert.equal((await findUserById('u1')).passwordHash, passwordHash);
});

test('password change: only ever changes the signed-in account', async () => {
  await seedUser();
  const grace = await seedUser({ id: 'u2', email: 'grace@example.com', name: 'Grace' });
  const res = await changePassword(signToken({ sub: 'u1', ver: 0 }), {
    currentPassword: PASSWORD,
    newPassword: 'brand new pass',
    id: 'u2',
    email: 'grace@example.com',
  });
  assert.equal(res.status, 200);
  assert.equal((await findUserById('u2')).passwordHash, grace.passwordHash);
  assert.equal(await verifyPassword('brand new pass', (await findUserById('u1')).passwordHash), true);
});
