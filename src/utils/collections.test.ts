import { describe, expect, it } from 'vitest';
import type { MediaSummary } from '../types';
import {
  EMPTY_COLLECTIONS,
  MAX_CUSTOM_COLLECTIONS,
  countDropped,
  exceedsLimits,
  isEmptyCollections,
  mergeCollections,
  toSummary,
  type CollectionsDoc,
} from './collections';

describe('countDropped', () => {
  it('counts collections and titles the server left out', () => {
    const sent: CollectionsDoc = {
      custom: [
        { id: 'custom-a', name: 'A', contentTypes: ['movie'] },
        { id: 'custom-b', name: 'B', contentTypes: ['movie'] },
      ],
      assignments: { 'movie-1': ['custom-a'], 'movie-2': ['watched'] },
      media: {},
    };
    const stored: CollectionsDoc = { custom: [sent.custom[0]], assignments: { 'movie-1': ['custom-a'] }, media: {} };
    expect(countDropped(sent, stored)).toBe(2);
    expect(countDropped(sent, sent)).toBe(0);
  });
});

describe('exceedsLimits', () => {
  it('flags more custom collections than an account can hold', () => {
    const custom = Array.from({ length: MAX_CUSTOM_COLLECTIONS + 1 }, (_, i) => ({
      id: `custom-${i}`,
      name: `C${i}`,
      contentTypes: ['movie' as const],
    }));
    expect(exceedsLimits({ ...EMPTY_COLLECTIONS, custom })).toBe(true);
    expect(exceedsLimits({ ...EMPTY_COLLECTIONS, custom: custom.slice(1) })).toBe(false);
  });
});

describe('toSummary', () => {
  it('keeps card fields and drops detail-only ones', () => {
    const detail = { ...media('movie-1'), overview: 'Long synopsis', cast: ['A'] };
    expect(toSummary(detail)).not.toHaveProperty('overview');
    expect(toSummary(detail)).toMatchObject({ id: 'movie-1', title: 'movie-1', type: 'movie' });
  });
});

const media = (id: string): MediaSummary => ({ id, title: id, type: 'movie', rating: null, genres: [] });

describe('mergeCollections', () => {
  it('adds guest collections and assignments the account does not have', () => {
    const guest: CollectionsDoc = {
      custom: [{ id: 'custom-g', name: 'Rainy Sundays', contentTypes: ['movie'] }],
      assignments: { 'movie-1': ['custom-g', 'to-watch'] },
      media: { 'movie-1': media('movie-1') },
    };
    expect(mergeCollections(EMPTY_COLLECTIONS, guest)).toEqual(guest);
  });

  it('folds a same-named guest collection into the account’s and keeps the account id', () => {
    const account: CollectionsDoc = {
      custom: [{ id: 'custom-a', name: 'Club Picks', contentTypes: ['book'] }],
      assignments: {},
      media: {},
    };
    const guest: CollectionsDoc = {
      custom: [{ id: 'custom-g', name: 'club picks', contentTypes: ['book'] }],
      assignments: { 'book-1': ['custom-g'] },
      media: { 'book-1': media('book-1') },
    };
    const merged = mergeCollections(account, guest);
    expect(merged.custom).toEqual(account.custom);
    expect(merged.assignments).toEqual({ 'book-1': ['custom-a'] });
  });

  it('keeps the account’s status when both chose a different one in an exclusive group', () => {
    const account: CollectionsDoc = {
      custom: [],
      assignments: { 'movie-1': ['watched'] },
      media: { 'movie-1': media('movie-1') },
    };
    const guest: CollectionsDoc = {
      custom: [{ id: 'custom-g', name: 'Faves', contentTypes: ['movie'] }],
      assignments: { 'movie-1': ['to-watch', 'custom-g'] },
      media: { 'movie-1': media('movie-1') },
    };
    expect(mergeCollections(account, guest).assignments['movie-1']).toEqual(['watched', 'custom-g']);
  });
});

describe('isEmptyCollections', () => {
  it('treats titles with no remaining collections as empty', () => {
    expect(isEmptyCollections(EMPTY_COLLECTIONS)).toBe(true);
    expect(isEmptyCollections({ custom: [], assignments: { 'movie-1': [] }, media: {} })).toBe(true);
    expect(isEmptyCollections({ custom: [], assignments: { 'movie-1': ['watched'] }, media: {} })).toBe(false);
  });
});
