import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { requireAuth, requireAuthConfig, signToken } from './auth.js';

process.env.JWT_SECRET = 'test-secret';

function run(middleware, authorization) {
  const result = { status: 200, body: null, nextCalled: false, req: { headers: { authorization } } };
  const res = {
    status(code) {
      result.status = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  middleware(result.req, res, () => {
    result.nextCalled = true;
  });
  return result;
}

test('accepts a token it signed and exposes the user id', () => {
  const result = run(requireAuth, `Bearer ${signToken({ sub: 'user-1' })}`);
  assert.equal(result.nextCalled, true);
  assert.equal(result.req.userId, 'user-1');
});

test('answers 401 for missing, expired, forged, and unsigned tokens', () => {
  const expired = jwt.sign({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) - 10 }, 'test-secret');
  const forged = jwt.sign({ sub: 'user-1' }, 'another-secret');
  const unsigned = jwt.sign({ sub: 'user-1' }, null, { algorithm: 'none' });
  for (const header of [undefined, 'Token abc', `Bearer ${expired}`, `Bearer ${forged}`, `Bearer ${unsigned}`]) {
    const result = run(requireAuth, header);
    assert.equal(result.status, 401, `expected 401 for ${header}`);
    assert.equal(result.nextCalled, false);
  }
});

test('reports accounts as not configured when JWT_SECRET is missing', () => {
  delete process.env.JWT_SECRET;
  try {
    const result = run(requireAuthConfig);
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'not_configured');
    assert.equal(result.nextCalled, false);
  } finally {
    process.env.JWT_SECRET = 'test-secret';
  }
});
