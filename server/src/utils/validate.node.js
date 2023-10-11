import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCredentials, parsePreferences } from './validate.js';

test('credentials: rejects non-string or missing input with a 400-safe message instead of crashing', () => {
  for (const body of [undefined, {}, { email: ['a@b.co'], password: 'longenough' }, { email: 'a@b.co', password: 12345678 }]) {
    assert.equal(parseCredentials(body).error, 'Email and password are required.');
  }
});

test('credentials: normalizes the email and defaults the name on register', () => {
  const { value } = parseCredentials({ email: '  Ana@Example.COM ', password: 'longenough' }, { register: true });
  assert.deepEqual(value, { email: 'ana@example.com', password: 'longenough', name: 'ana' });
});

test('credentials: enforces email format, password length, and name length on register', () => {
  const register = (body) => parseCredentials({ email: 'a@b.co', password: 'longenough', ...body }, { register: true });
  assert.match(register({ email: 'not-an-email' }).error, /valid email/);
  assert.match(register({ password: 'short' }).error, /at least 8/);
  assert.match(register({ password: 'x'.repeat(73) }).error, /at most 72/);
  assert.match(register({ name: 'n'.repeat(61) }).error, /at most 60/);
  assert.match(register({ name: { admin: true } }).error, /Name must be text/);
});

test('credentials: login does not apply register-only password rules', () => {
  assert.equal(parseCredentials({ email: 'a@b.co', password: 'short' }).error, undefined);
});

test('preferences: accepts known keys only and validates their values', () => {
  assert.deepEqual(parsePreferences({ favoriteGenres: ['Drama'], role: 'admin' }).value, { favoriteGenres: ['Drama'] });
  assert.ok(parsePreferences({ theme: 'neon' }).error);
  assert.ok(parsePreferences({ favoriteGenres: 'Drama' }).error);
  assert.ok(parsePreferences([]).error);
});
