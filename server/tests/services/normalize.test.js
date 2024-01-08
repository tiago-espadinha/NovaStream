import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildId, normalizeRatingOutOf10 } from '../../src/services/normalize.js';

test('scales a rating to ten, to one decimal', () => {
  assert.equal(normalizeRatingOutOf10(4.5, 5), 9);
  assert.equal(normalizeRatingOutOf10(3.33, 5), 6.7);
  assert.equal(normalizeRatingOutOf10(7.25, 10), 7.3);
});

test('keeps a real zero, which is not the same as no rating', () => {
  assert.equal(normalizeRatingOutOf10(0, 5), 0);
});

test('has no rating for a missing or unusable value', () => {
  assert.equal(normalizeRatingOutOf10(null, 5), null);
  assert.equal(normalizeRatingOutOf10(undefined, 5), null);
  assert.equal(normalizeRatingOutOf10(Number.NaN, 5), null);
});

test('builds the "type-externalId" id the client splits on its first hyphen', () => {
  assert.equal(buildId('game', 42), 'game-42');
  assert.equal(buildId('music', 'the-cure'), 'music-the-cure');
});
