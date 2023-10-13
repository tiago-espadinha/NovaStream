import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCredentials, parseMediaSnapshot, parsePreferences } from './validate.js';

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

test('media snapshot: keeps only card fields and drops detail payloads and unknown keys', () => {
  const { value } = parseMediaSnapshot({
    id: 'movie-1',
    title: 'Dune',
    type: 'movie',
    rating: 8.1,
    genres: ['Sci-Fi', 42],
    releaseYear: 2021,
    posterUrl: 'https://image.tmdb.org/p.jpg',
    overview: 'A long synopsis',
    cast: ['A', 'B'],
    savedAt: '1999-01-01',
    isAdmin: true,
  });
  assert.deepEqual(value, {
    id: 'movie-1',
    title: 'Dune',
    type: 'movie',
    rating: 8.1,
    genres: ['Sci-Fi'],
    tags: [],
    releaseYear: 2021,
    posterUrl: 'https://image.tmdb.org/p.jpg',
  });
});

test('media snapshot: requires id, title, and a known type, and only keeps https artwork', () => {
  assert.ok(parseMediaSnapshot({ id: 'x', title: 'y', type: 'podcast' }).error);
  assert.ok(parseMediaSnapshot({ id: 'x', type: 'movie' }).error);
  assert.ok(parseMediaSnapshot(null).error);
  assert.equal(parseMediaSnapshot({ id: 'x', title: 'y', type: 'book', posterUrl: 'javascript:alert(1)' }).value.posterUrl, null);
});

test('media snapshot: keeps music play stats only when both counts are present', () => {
  const song = { id: 'music-1', title: 'Song', type: 'music', musicKind: 'song', artist: 'Band' };
  assert.deepEqual(
    parseMediaSnapshot({ ...song, playStats: { listeners: '10', playcount: '20' } }).value.playStats,
    { listeners: '10', playcount: '20' },
  );
  assert.equal(parseMediaSnapshot({ ...song, playStats: { listeners: '10' } }).value.playStats, undefined);
});

test('preferences: accepts known keys only and validates their values', () => {
  assert.deepEqual(parsePreferences({ favoriteGenres: ['Drama'], role: 'admin' }).value, { favoriteGenres: ['Drama'] });
  assert.ok(parsePreferences({ theme: 'neon' }).error);
  assert.ok(parsePreferences({ favoriteGenres: 'Drama' }).error);
  assert.ok(parsePreferences([]).error);
});
