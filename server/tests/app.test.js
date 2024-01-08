import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { app } from '../src/app.js';

// The request log runs outside production, so its output is captured here and checked below.
const realLog = console.log;
const realDir = console.dir;
const realError = console.error;
let server;
let baseUrl;
let logged;
let dumped;
let originalEnv;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => {
  originalEnv = { JWT_SECRET: process.env.JWT_SECRET, NODE_ENV: process.env.NODE_ENV };
  delete process.env.JWT_SECRET;
  delete process.env.NODE_ENV;
  logged = [];
  dumped = [];
  console.log = (...args) => logged.push(args.join(' '));
  console.dir = (value) => dumped.push(value);
  console.error = () => {};
});

afterEach(() => {
  console.log = realLog;
  console.dir = realDir;
  console.error = realError;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const post = (path, body, headers = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });

/** The log entry is written once the response has finished, which can be just after it arrives. */
async function waitForLogEntry(matches) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const entry = dumped.find(matches);
    if (entry) return entry;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return undefined;
}

test('reports health', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('allows the configured web app’s origin', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.headers.get('access-control-allow-origin'), process.env.CORS_ORIGIN || 'http://localhost:5173');
});

test('account routes answer 503 when accounts are not configured', async () => {
  for (const path of ['/api/auth/me', '/api/saved', '/api/collections']) {
    const res = await fetch(`${baseUrl}${path}`);
    assert.equal(res.status, 503, path);
    assert.equal((await res.json()).code, 'not_configured');
  }
});

test('public routes do not need accounts configured', async () => {
  // Refused for its missing query, so it got past where an account route would have stopped.
  const res = await fetch(`${baseUrl}/api/search`);
  assert.equal(res.status, 400);
});

test('an unknown route is a 404', async () => {
  assert.equal((await fetch(`${baseUrl}/api/nope`)).status, 404);
});

test('accepts a large collections document but limits other bodies to the default', async () => {
  const large = JSON.stringify({ padding: 'x'.repeat(200 * 1024) });
  // 503, not 413: the size was accepted and the request went on to the accounts check.
  assert.equal((await post('/api/collections', large)).status, 503);
  // The error handler's generic answer is what a refused body gets anywhere else.
  assert.equal((await post('/api/auth/login', large)).status, 500);
});

test('the error handler answers generically, without the reason', async () => {
  const res = await post('/api/auth/login', '{ not json');
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'Internal server error' });
});

test('still refuses collections past their own limit', async () => {
  const huge = JSON.stringify({ padding: 'x'.repeat(1024 * 1024 + 1) });
  assert.equal((await post('/api/collections', huge)).status, 500);
});

test('logs the request with secrets redacted, in the URL, headers and bodies', async () => {
  await post('/api/auth/login?token=abc&page=2', JSON.stringify({ email: 'a@b.co', password: 'hunter2' }), {
    Authorization: 'Bearer hunter2',
  });

  const entry = await waitForLogEntry(({ request }) => request.body?.email === 'a@b.co');
  const line = logged.find((text) => text.startsWith('[API] POST'));
  assert.match(line, /token=%5BREDACTED%5D&page=2/);
  assert.equal(entry.request.headers.authorization, '[REDACTED]');
  assert.equal(entry.request.body.password, '[REDACTED]');
  assert.equal(entry.request.body.email, 'a@b.co');
  assert.equal(JSON.stringify(entry).includes('hunter2'), false);
});

test('logs a JSON response as data', async () => {
  await fetch(`${baseUrl}/api/health`);
  const entry = await waitForLogEntry(({ response }) => response.body?.ok === true);
  assert.deepEqual(entry.response.body, { ok: true });
});

test('logs nothing in production', async () => {
  process.env.NODE_ENV = 'production';
  await fetch(`${baseUrl}/api/health`);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(logged, []);
  assert.deepEqual(dumped, []);
});
