import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asyncRoute } from '../../src/utils/asyncRoute.js';

test('forwards a rejected handler to the error handler', async () => {
  const failure = new Error('boom');
  const received = [];
  await asyncRoute(async () => {
    throw failure;
  })({}, {}, (err) => received.push(err));
  assert.deepEqual(received, [failure]);
});

test('does not call next when the handler succeeds', async () => {
  let nextCalls = 0;
  await asyncRoute(async () => 'done')({}, {}, () => (nextCalls += 1));
  assert.equal(nextCalls, 0);
});

test('passes the request, response and next through to the handler', async () => {
  const req = {};
  const res = {};
  const next = () => {};
  let seen;
  await asyncRoute(async (...args) => {
    seen = args;
  })(req, res, next);
  assert.deepEqual(seen, [req, res, next]);
  assert.equal(seen[0], req);
});

test('handles a handler that returns a plain value', async () => {
  let nextCalls = 0;
  await asyncRoute(() => 'done')({}, {}, () => (nextCalls += 1));
  assert.equal(nextCalls, 0);
});
