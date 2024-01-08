// @vitest-environment jsdom
import '../helpers/dom';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockTrending } from '../../src/data/mockData';
import { useHomeShelves } from '../../src/hooks/useHomeShelves';
import type { useTrending } from '../../src/hooks/useTrending';
import type { ContentType, MediaSummary } from '../../src/types';
import { media } from '../helpers/fixtures';

const config = vi.hoisted(() => ({ USE_MOCK: true, API_BASE_URL: 'http://test/api' }));

vi.mock('../../src/config', () => config);

const featured = media('movie-top', { rating: 9.5, posterUrl: 'https://img/top.jpg' });
const other = media('movie-other', { rating: 5 });
const book = media('book-1', { type: 'book', rating: 7 });
const displayed = [other, featured, book];
const idle: ReturnType<typeof useTrending> = { items: [], loading: false, problem: null, retry: () => {} };

function shelves({
  trimmedQuery = '',
  activeType = 'all',
  displayedItems = displayed,
  savedMedia = [],
  trending = idle,
}: {
  trimmedQuery?: string;
  activeType?: ContentType | 'all';
  displayedItems?: MediaSummary[];
  savedMedia?: MediaSummary[];
  trending?: ReturnType<typeof useTrending>;
} = {}) {
  return renderHook(() => useHomeShelves({ trimmedQuery, activeType, displayedItems, savedMedia, trending })).result
    .current;
}

beforeEach(() => {
  config.USE_MOCK = true;
});

describe('useHomeShelves while browsing the mock catalog', () => {
  it('features the best title and leaves it out of the shelves', () => {
    const result = shelves();
    expect(result.spotlight).toBe(featured);
    expect(result.shelfItems).toEqual([other, book]);
    expect(result.mixedShelf.map(({ id }) => id)).not.toContain('movie-top');
    expect(result.typeShelves.map(({ type }) => type)).toEqual(['movie', 'book']);
    expect(result.showShelves).toBe(true);
  });

  it('shows a plain list under a type tab, with no type shelves', () => {
    expect(shelves({ activeType: 'movie' }).showShelves).toBe(false);
  });

  it('has no spotlight during a search', () => {
    const result = shelves({ trimmedQuery: 'heat' });
    expect(result.spotlight).toBeNull();
    expect(result.shelfItems).toEqual(displayed);
    expect(result.showShelves).toBe(false);
  });

  it('uses the bundled trending list, minus the title already featured', () => {
    const top = { ...mockTrending[0], rating: 10, posterUrl: 'https://img/top.jpg' };
    const result = shelves({ displayedItems: [top] });
    expect(result.spotlight?.id).toBe(top.id);
    expect(result.trendingItems.some(({ id }) => id === top.id)).toBe(false);
    expect(result.trendingItems).toHaveLength(mockTrending.length - 1);
  });
});

describe('useHomeShelves with live data', () => {
  beforeEach(() => {
    config.USE_MOCK = false;
  });

  it('has no browsing shelves, since live results only follow a search', () => {
    const result = shelves();
    expect(result.spotlight).toBeNull();
    expect(result.showShelves).toBe(false);
  });

  it('shows trending while it loads, has items, or has a problem', () => {
    const problem = { message: 'Down', retryable: true };
    expect(shelves({ trending: { ...idle, loading: true } }).showTrending).toBe(true);
    expect(shelves({ trending: { ...idle, items: [book] } }).showTrending).toBe(true);
    expect(shelves({ trending: { ...idle, problem } }).showTrending).toBe(true);
  });

  it('leaves out a feed that answered with nothing, and any feed during a search', () => {
    expect(shelves().showTrending).toBe(false);
    expect(shelves({ trimmedQuery: 'heat', trending: { ...idle, items: [book] } }).showTrending).toBe(false);
  });

  it('treats a problem as a failure only when there is nothing to show', () => {
    const problem = { message: 'Down', retryable: true };
    expect(shelves({ trending: { ...idle, problem } }).trendingFailed).toBe(true);
    expect(shelves({ trending: { ...idle, problem, items: [book] } }).trendingFailed).toBe(false);
  });

  it('samples at most eight favorites, and none during a search', () => {
    const saved = Array.from({ length: 12 }, (_, index) => media(`movie-${index}`));
    const shelf = shelves({ savedMedia: saved }).favoritesShelf;
    expect(shelf).toHaveLength(8);
    expect(new Set(shelf).size).toBe(8);
    expect(shelf.every((item) => saved.includes(item))).toBe(true);
    expect(shelves({ savedMedia: saved, trimmedQuery: 'heat' }).favoritesShelf).toEqual([]);
  });

  it('keeps the favorites order steady for the visit as the list changes', () => {
    const saved = Array.from({ length: 6 }, (_, index) => media(`movie-${index}`));
    const { result, rerender } = renderHook(
      ({ savedMedia }) =>
        useHomeShelves({ trimmedQuery: '', activeType: 'all', displayedItems: [], savedMedia, trending: idle }),
      { initialProps: { savedMedia: saved } },
    );
    const before = result.current.favoritesShelf.map(({ id }) => id);
    const removed = before[2];

    rerender({ savedMedia: saved.filter(({ id }) => id !== removed) });
    expect(result.current.favoritesShelf.map(({ id }) => id)).toEqual(before.filter((id) => id !== removed));
  });
});
