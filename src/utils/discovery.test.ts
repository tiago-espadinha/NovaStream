import { describe, expect, it } from 'vitest';
import { groupByType, mediaTypeLabel, mixAcrossTypes, pickSpotlight, sampleStable } from './discovery';
import type { MediaSummary } from '../types';

const item = (id: string, type: MediaSummary['type'], rating: number | null, extra: Partial<MediaSummary> = {}) =>
  ({ id, title: id, type, rating, genres: [], ...extra }) as MediaSummary;

describe('pickSpotlight', () => {
  it('returns null when there is nothing to feature', () => {
    expect(pickSpotlight([])).toBeNull();
  });

  it('prefers the best-rated title and ignores music play counts', () => {
    const items = [item('song', 'music', 250000), item('film', 'movie', 8.1), item('game', 'game', 9.3)];
    expect(pickSpotlight(items)?.id).toBe('game');
  });

  it('prefers a title with real artwork over a higher-rated one without', () => {
    const items = [item('plain', 'movie', 9.5), item('poster', 'tv', 7.2, { posterUrl: 'https://img/p.jpg' })];
    expect(pickSpotlight(items)?.id).toBe('poster');
  });

  it('falls back to music when no other format is present', () => {
    const items = [item('quiet', 'music', 1200), item('loud', 'music', 90000)];
    expect(pickSpotlight(items)?.id).toBe('loud');
  });
});

describe('mixAcrossTypes', () => {
  it('interleaves formats in catalog order and respects the limit', () => {
    const items = [
      item('m1', 'movie', 8),
      item('m2', 'movie', 7),
      item('b1', 'book', 9),
      item('g1', 'game', 6),
      item('b2', 'book', 5),
    ];
    expect(mixAcrossTypes(items, 4).map((media) => media.id)).toEqual(['m1', 'b1', 'g1', 'm2']);
  });
});

describe('groupByType', () => {
  it('omits formats with no titles', () => {
    const groups = groupByType([item('t1', 'tv', 8), item('m1', 'movie', 7)]);
    expect(groups.map((group) => group.type)).toEqual(['movie', 'tv']);
  });
});

describe('mediaTypeLabel', () => {
  it('names the music kind when known', () => {
    expect(mediaTypeLabel({ type: 'music', musicKind: 'album' })).toBe('Music · Album');
    expect(mediaTypeLabel({ type: 'tv' })).toBe('Series');
  });
});

describe('sampleStable', () => {
  const many = Array.from({ length: 12 }, (_, i) => item(`id${i}`, 'movie', i));

  it('returns at most the limit, with no duplicates', () => {
    const sample = sampleStable(many, 8, 'seed');
    expect(sample).toHaveLength(8);
    expect(new Set(sample.map((media) => media.id)).size).toBe(8);
  });

  it('shuffles sequential ids rather than keeping them in order', () => {
    const ids = sampleStable(many, 12, 'seed').map((media) => media.id);
    expect(ids).not.toEqual(many.map((media) => media.id));
  });

  it('keeps the remaining order when an item is removed', () => {
    const before = sampleStable(many, 12, 'seed').map((media) => media.id);
    const removed = before[3];
    const after = sampleStable(many.filter((media) => media.id !== removed), 12, 'seed').map((media) => media.id);
    expect(after).toEqual(before.filter((id) => id !== removed));
  });
});
