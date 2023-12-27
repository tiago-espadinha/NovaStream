import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseCollections,
  parseCredentials,
  parseMediaSnapshot,
  parsePasswordChange,
  parsePreferences,
} from './validate.js';

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

test('password change: requires both passwords as non-empty text', () => {
  for (const body of [undefined, null, {}, { currentPassword: 'longenough' }, { currentPassword: '', newPassword: 'longenough' }, { currentPassword: 1, newPassword: 'longenough' }]) {
    assert.equal(parsePasswordChange(body).error, 'Enter your current password and a new one.');
  }
});

test('password change: applies the registration rule to the new password only', () => {
  const change = (newPassword) => parsePasswordChange({ currentPassword: 'short', newPassword });
  assert.equal(change('1234567').error, 'Password must be at least 8 characters.');
  assert.equal(change('é'.repeat(37)).error, 'Password must be at most 72 characters.');
  assert.deepEqual(change('longenough').value, { currentPassword: 'short', newPassword: 'longenough' });
});

test('password change: refuses a new password equal to the current one', () => {
  const { error } = parsePasswordChange({ currentPassword: 'longenough', newPassword: 'longenough' });
  assert.equal(error, 'Choose a password different from your current one.');
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

const dune = { id: 'movie-1', title: 'Dune', type: 'movie' };
const duneSnapshot = parseMediaSnapshot(dune).value;

test('collections: keeps valid custom collections and assignments with their snapshots', () => {
  const { value } = parseCollections({
    custom: [{ id: 'custom-abc', name: ' Rainy Sundays ', contentTypes: ['movie', 'movie', 'podcast'] }],
    assignments: { 'movie-1': ['to-watch', 'custom-abc'] },
    media: { 'movie-1': { ...dune, overview: 'dropped' } },
  });
  assert.deepEqual(value, {
    custom: [{ id: 'custom-abc', name: 'Rainy Sundays', contentTypes: ['movie'] }],
    assignments: { 'movie-1': ['to-watch', 'custom-abc'] },
    media: { 'movie-1': duneSnapshot },
  });
});

test('collections: drops entries that do not fit instead of rejecting the whole document', () => {
  const { value } = parseCollections({
    custom: [
      { id: 'custom-a', name: 'Club', contentTypes: ['book'] },
      { id: 'custom-b', name: 'club', contentTypes: ['book'] }, // duplicate name
      { id: 'evil', name: 'Bad id', contentTypes: ['book'] },
      { id: 'custom-c', name: 'x'.repeat(33), contentTypes: ['book'] },
      { id: 'custom-d', name: 'No formats', contentTypes: [] },
    ],
    assignments: {
      'movie-1': ['ghost-collection', 'watched'],
      'movie-2': ['watched'], // no snapshot
      'movie-3': ['watched'], // snapshot for a different id
      'movie-4': 'watched',
    },
    media: { 'movie-1': dune, 'movie-3': dune },
  });
  assert.deepEqual(value.custom.map(({ id }) => id), ['custom-a']);
  assert.deepEqual(value.assignments, { 'movie-1': ['watched'] });
  assert.deepEqual(Object.keys(value.media), ['movie-1']);
});

test('collections: invalid entries do not use up the 500-title limit', () => {
  const assignments = {};
  const media = {};
  for (let i = 0; i < 600; i += 1) assignments[`bad-${i}`] = ['watched']; // no snapshots
  for (let i = 0; i < 3; i += 1) {
    assignments[`movie-${i}`] = ['watched'];
    media[`movie-${i}`] = { id: `movie-${i}`, title: `Film ${i}`, type: 'movie' };
  }
  const { value } = parseCollections({ custom: [], assignments, media });
  assert.deepEqual(Object.keys(value.assignments), ['movie-0', 'movie-1', 'movie-2']);
});

test('collections: rejects a body that is not an object', () => {
  assert.ok(parseCollections(null).error);
  assert.ok(parseCollections([]).error);
});

test('preferences: accepts known keys only and validates their values', () => {
  assert.deepEqual(parsePreferences({ favoriteGenres: ['Drama'], role: 'admin' }).value, { favoriteGenres: ['Drama'] });
  assert.ok(parsePreferences({ theme: 'neon' }).error);
  assert.ok(parsePreferences({ favoriteGenres: 'Drama' }).error);
  assert.ok(parsePreferences([]).error);
});
