import { describe, expect, it } from 'vitest';
import type { MediaSummary } from '../types';
import {
  EMPTY_COLLECTIONS,
  addCollection,
  MAX_CUSTOM_COLLECTIONS,
  countDropped,
  exceedsLimits,
  isEmptyCollections,
  mergeCollections,
  newCollectionProblem,
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

describe('newCollectionProblem', () => {
  const existing = [{ id: 'custom-a', name: 'Rainy Sundays', contentTypes: ['movie' as const] }];

  it('flags a name already in use, ignoring case and surrounding spaces', () => {
    expect(newCollectionProblem('  rainy sundays ', ['movie'], existing)).toEqual({
      field: 'name',
      message: 'You already have a collection called “Rainy Sundays”.',
    });
  });

  it('asks for a format when none is picked', () => {
    expect(newCollectionProblem('Club Picks', [], existing)).toEqual({ field: 'formats', message: 'Pick at least one format.' });
  });

  it('has nothing to say about an empty name or a valid one', () => {
    expect(newCollectionProblem('   ', ['movie'], existing)).toBeNull();
    expect(newCollectionProblem('Club Picks', ['book'], existing)).toBeNull();
  });
});

describe('addCollection', () => {
  const collection = { id: 'custom-n', name: 'Night In', contentTypes: ['movie' as const] };

  it('adds the collection with the title already in it, keeping its other collections', () => {
    const doc: CollectionsDoc = { custom: [], assignments: { 'movie-1': ['watched'] }, media: { 'movie-1': media('movie-1') } };
    const next = addCollection(doc, collection, { ...media('movie-1'), overview: 'Long synopsis' } as MediaSummary);
    expect(next.custom).toEqual([collection]);
    expect(next.assignments['movie-1']).toEqual(['watched', 'custom-n']);
    expect(next.media['movie-1']).not.toHaveProperty('overview');
  });

  it('only adds the collection when the title’s format is not one it covers', () => {
    const book = { ...media('book-1'), type: 'book' as const };
    expect(addCollection(EMPTY_COLLECTIONS, collection, book)).toEqual({ ...EMPTY_COLLECTIONS, custom: [collection] });
    expect(addCollection(EMPTY_COLLECTIONS, collection)).toEqual({ ...EMPTY_COLLECTIONS, custom: [collection] });
  });
});
