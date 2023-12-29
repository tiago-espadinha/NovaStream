import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import bcrypt from 'bcryptjs';
import express from 'express';
import { fakeUpstash } from '../db/fakeUpstash.js';

// The routers use the app's store, which picks Redis when these are set. The fake answers
// those requests in memory, so no test reads or writes data.json. Both must be in place
// before the routers are imported, because the store is built at import time.
process.env.JWT_SECRET = 'test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
let nowMs = Date.now();
const upstash = fakeUpstash({ now: () => nowMs });
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) =>
  String(url).startsWith(process.env.UPSTASH_REDIS_REST_URL) ? upstash.fetchImpl(url, init) : realFetch(url, init);

const { authRouter } = await import('./auth.js');
const { savedRouter } = await import('./saved.js');
const { collectionsRouter } = await import('./collections.js');
const { requireAuthConfig, signToken } = await import('../middleware/auth.js');
const { createUser, findUserByEmail, findUserById, updateUser } = await import('../db/store.js');
const { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } = await import('../utils/password.js');

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

const deleteAccount = (token, body) => call('DELETE', '/api/auth/account', { token, body });

test('account deletion: requires a valid session', async () => {
  await seedUser();
  for (const token of [undefined, 'not-a-jwt', signToken({ sub: 'u1', ver: 1 }), signToken({ sub: 'gone' })]) {
    assert.equal((await deleteAccount(token, { password: PASSWORD })).status, 401);
  }
  assert.equal((await findUserById('u1')).savedMedia.length, 1);
});

test('account deletion: a missing or wrong password keeps the account and the session', async () => {
  await seedUser();
  const token = signToken({ sub: 'u1', ver: 0 });
  for (const body of [undefined, {}, { password: '' }, { password: 42 }]) {
    const res = await deleteAccount(token, body);
    assert.deepEqual([res.status, res.body.error], [400, 'Enter your password to delete your account.']);
  }
  const wrong = await deleteAccount(token, { password: 'not my password' });
  assert.deepEqual([wrong.status, wrong.body.code], [403, 'wrong_password']);

  const user = await findUserById('u1');
  assert.equal(user.savedMedia.length, 1);
  assert.deepEqual(user.collections, { custom: [], assignments: {}, media: {} });
  assert.equal((await call('GET', '/api/auth/me', { token })).status, 200);
});

test('account deletion: removes the account and its data, and ends the session everywhere', async () => {
  await seedUser();
  const token = signToken({ sub: 'u1', ver: 0 });
  const res = await deleteAccount(token, { password: PASSWORD });
  assert.equal(res.status, 204);

  assert.equal(await findUserById('u1'), null);
  assert.deepEqual([...upstash.data.keys()].filter((key) => key.startsWith('user')), []);
  for (const [method, path, body] of accountRequests) {
    assert.equal((await call(method, path, { token, body })).status, 401, `${method} ${path}`);
  }
  assert.equal(await findUserById('u1'), null);
  assert.equal((await deleteAccount(token, { password: PASSWORD })).status, 401);
  assert.equal((await login(PASSWORD)).status, 401);
});

test('account deletion: the email can register again as a fresh account', async () => {
  await seedUser();
  await deleteAccount(signToken({ sub: 'u1', ver: 0 }), { password: PASSWORD });
  const res = await call('POST', '/api/auth/register', { body: { email: 'ada@example.com', password: 'another pass' } });
  assert.equal(res.status, 201);
  assert.notEqual(res.body.user.id, 'u1');
  assert.deepEqual(res.body.user.savedMedia, []);
  assert.equal('collections' in res.body.user, false);
});

test('account deletion: only ever deletes the signed-in account', async () => {
  await seedUser();
  await seedUser({ id: 'u2', email: 'grace@example.com', name: 'Grace' });
  const res = await deleteAccount(signToken({ sub: 'u1', ver: 0 }), {
    password: PASSWORD,
    id: 'u2',
    email: 'grace@example.com',
  });
  assert.equal(res.status, 204);
  assert.equal(await findUserById('u1'), null);
  const grace = await findUserById('u2');
  assert.equal(grace.savedMedia.length, 1);
  assert.equal((await login(PASSWORD, 'grace@example.com')).status, 200);
});

const minutes = (n) => {
  nowMs += n * 60 * 1000;
};

test('sign-in: after 5 failures the account answers 429 without checking the password', async () => {
  await seedUser();
  for (let i = 0; i < 5; i++) assert.equal((await login('not my password')).status, 401);

  const res = await realFetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ADA@example.com', password: PASSWORD }),
  });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '900');
  assert.deepEqual(await res.json(), {
    error: 'Too many password attempts. Try again in 15 minutes.',
    code: 'rate_limited',
    retryAfterSeconds: 900,
  });
});

test('sign-in: parallel guesses are held to the same 5 attempts', async () => {
  await seedUser();
  const statuses = await Promise.all(Array.from({ length: 10 }, () => login('not my password')));
  assert.deepEqual(statuses.map((res) => res.status).sort(), [...Array(5).fill(401), ...Array(5).fill(429)]);
});

test('sign-in: the limit resets after the window', async () => {
  await seedUser();
  for (let i = 0; i < 5; i++) await login('not my password');
  minutes(14);
  const waiting = await login(PASSWORD);
  assert.deepEqual([waiting.status, waiting.body.retryAfterSeconds], [429, 60]);
  assert.equal(waiting.body.error, 'Too many password attempts. Try again in 1 minute.');
  minutes(1);
  assert.equal((await login(PASSWORD)).status, 200);
});

test('sign-in: a correct password clears the account count', async () => {
  await seedUser();
  for (let i = 0; i < 4; i++) await login('not my password');
  assert.equal((await login(PASSWORD)).status, 200);
  for (let i = 0; i < 4; i++) assert.equal((await login('not my password')).status, 401);
  assert.equal((await login(PASSWORD)).status, 200);
});

test('sign-in: unknown emails are limited like real ones, and other accounts are unaffected', async () => {
  await seedUser({ id: 'u2', email: 'grace@example.com', name: 'Grace' });
  for (let i = 0; i < 5; i++) assert.equal((await login('guess', 'nobody@example.com')).status, 401);
  assert.equal((await login('guess', 'nobody@example.com')).status, 429);
  assert.equal((await login(PASSWORD, 'grace@example.com')).status, 200);
});

test('sign-in: an unknown email costs one password check and answers like a wrong password', async (t) => {
  await seedUser();
  const compare = t.mock.method(bcrypt, 'compare');
  const wrong = await login('not my password');
  assert.equal(compare.mock.callCount(), 1);
  const unknown = await login('not my password', 'nobody@example.com');
  assert.equal(compare.mock.callCount(), 2);
  assert.deepEqual(unknown, wrong);
  assert.deepEqual(wrong, { status: 401, body: { error: 'Invalid email or password' } });
});

test('sign-in: the stand-in hash for unknown emails costs as much as a stored one', async () => {
  const { passwordHash } = await seedUser();
  // bcryptjs returns at once for a malformed hash, so a typo here would quietly bring the leak back.
  assert.match(DUMMY_PASSWORD_HASH, /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);
  assert.equal(bcrypt.getRounds(DUMMY_PASSWORD_HASH), bcrypt.getRounds(passwordHash));
});

test('sign-in: 20 failures from one IP block it for every account', async () => {
  await seedUser();
  for (let i = 0; i < 20; i++) assert.equal((await login('guess', `user${i}@example.com`)).status, 401);
  assert.equal((await login(PASSWORD)).status, 429);
});

test('password change and deletion: 429 after 5 failures, keeping the password, account and session', async () => {
  const { passwordHash } = await seedUser();
  const token = signToken({ sub: 'u1', ver: 0 });
  for (let i = 0; i < 3; i++) {
    assert.equal((await changePassword(token, { currentPassword: 'nope', newPassword: 'brand new pass' })).status, 403);
  }
  for (let i = 0; i < 2; i++) assert.equal((await deleteAccount(token, { password: 'nope' })).status, 403);

  const change = await changePassword(token, { currentPassword: PASSWORD, newPassword: 'brand new pass' });
  assert.deepEqual([change.status, change.body.code], [429, 'rate_limited']);
  const remove = await deleteAccount(token, { password: PASSWORD });
  assert.deepEqual([remove.status, remove.body.code], [429, 'rate_limited']);

  assert.equal((await findUserById('u1')).passwordHash, passwordHash);
  assert.equal((await call('GET', '/api/auth/me', { token })).status, 200);
  assert.equal((await login(PASSWORD)).status, 429);
});

const register = (email, password = PASSWORD) => call('POST', '/api/auth/register', { body: { email, password } });

test('sign-up: a taken email answers 409 email_taken, whatever its case', async () => {
  await seedUser();
  assert.deepEqual(await register('ADA@example.com'), {
    status: 409,
    body: { error: 'An account with that email already exists.', code: 'email_taken' },
  });
});

test('sign-up: new and taken emails share one budget of 10 per IP an hour', async () => {
  await seedUser();
  for (let i = 0; i < 5; i++) assert.equal((await register('ada@example.com')).status, 409);
  for (let i = 0; i < 5; i++) assert.equal((await register(`new${i}@example.com`)).status, 201);

  const res = await realFetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ada@example.com', password: PASSWORD }),
  });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '3600');
  assert.deepEqual(await res.json(), {
    error: 'Too many sign-up attempts. Try again in 60 minutes.',
    code: 'rate_limited',
    retryAfterSeconds: 3600,
  });
  assert.equal((await register('fresh@example.com')).status, 429);
  assert.equal(await findUserByEmail('fresh@example.com'), null);
});

test('sign-up: malformed requests are refused without using the budget', async () => {
  for (let i = 0; i < 12; i++) assert.equal((await register('not an email')).status, 400);
  assert.equal((await register('new@example.com')).status, 201);
});

test('sign-up: the limit resets after the window and is separate from sign-in', async () => {
  for (let i = 0; i < 10; i++) await register(`new${i}@example.com`);
  assert.equal((await register('late@example.com')).status, 429);
  assert.equal((await login(PASSWORD, 'new0@example.com')).status, 200);
  minutes(60);
  assert.equal((await register('late@example.com')).status, 201);
});
