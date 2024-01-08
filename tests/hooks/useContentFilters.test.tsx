// @vitest-environment jsdom
import '../helpers/dom';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useContentFilters } from '../../src/hooks/useContentFilters';
import type { ContentType, MediaSummary, MusicKind } from '../../src/types';
import { media } from '../helpers/fixtures';

const items: MediaSummary[] = [
  media('movie-drama', { genres: ['Drama'], rating: 9, releaseYear: 2030, title: 'Zebra' }),
  media('movie-action', { genres: ['Action'], rating: 5, releaseYear: 2020, title: 'Apple' }),
  media('book-1', { type: 'book', genres: ['Drama'], rating: 7, releaseYear: 2010, title: 'Mango' }),
];

const noMusicKindChange = () => {};

function setup({
  source = items,
  activeType = 'all',
  musicKind = 'all',
  onMusicKindChange = noMusicKindChange,
}: {
  source?: MediaSummary[];
  activeType?: ContentType | 'all';
  musicKind?: MusicKind | 'all';
  onMusicKindChange?: (kind: MusicKind | 'all') => void;
} = {}) {
  return renderHook((props) => useContentFilters({ query: '', onMusicKindChange, ...props }), {
    initialProps: { items: source, activeType, musicKind },
  });
}

const ids = (list: MediaSummary[]) => list.map(({ id }) => id);

describe('useContentFilters', () => {
  it('starts with every title and no active filters', () => {
    const { result } = setup();
    expect(ids(result.current.displayedItems).sort()).toEqual(['book-1', 'movie-action', 'movie-drama']);
    expect(result.current.activeCount).toBe(0);
    expect(result.current.sortBy).toBe('featured');
  });

  it('a type tab limits the titles and the genre groups to that type', () => {
    const { result } = setup({ activeType: 'book' });
    expect(ids(result.current.displayedItems)).toEqual(['book-1']);
    expect(result.current.genreGroups.map(({ type }) => type)).toEqual(['book']);
  });

  it('unticking a category hides its titles, drops its genres and counts as one filter', () => {
    const { result } = setup();
    act(() => result.current.toggleGenre('book', 'Drama'));
    act(() => result.current.toggleCategory('book'));

    expect(result.current.selectedGenres).toEqual([]);
    expect(result.current.genreGroups.some(({ type }) => type === 'book')).toBe(false);
    expect(ids(result.current.displayedItems).sort()).toEqual(['movie-action', 'movie-drama']);
    expect(result.current.activeCount).toBe(1);

    act(() => result.current.toggleCategory('book'));
    expect(result.current.activeCount).toBe(0);
    expect(ids(result.current.displayedItems)).toContain('book-1');
  });

  it('toggles a genre per type, so Drama in books does not select Drama in movies', () => {
    const { result } = setup();
    act(() => result.current.toggleGenre('book', 'Drama'));
    expect(ids(result.current.displayedItems)).toEqual(['book-1']);
    expect(result.current.activeCount).toBe(1);

    act(() => result.current.toggleGenre('book', 'Drama'));
    expect(result.current.selectedGenres).toEqual([]);
  });

  it('moving to a type tab forgets the genres of other types', () => {
    const { result, rerender } = setup();
    act(() => result.current.toggleGenre('book', 'Drama'));
    act(() => result.current.toggleGenre('movie', 'Action'));

    rerender({ items, activeType: 'movie', musicKind: 'all' });
    expect(result.current.selectedGenres).toEqual([{ type: 'movie', genre: 'Action' }]);
  });

  it('filters by minimum rating and sorts as asked', () => {
    const { result } = setup();
    act(() => result.current.setMinRating(6));
    expect(ids(result.current.displayedItems).sort()).toEqual(['book-1', 'movie-drama']);
    expect(result.current.activeCount).toBe(1);

    act(() => result.current.setMinRating(0));
    act(() => result.current.setSortBy('title'));
    expect(ids(result.current.displayedItems)).toEqual(['movie-action', 'book-1', 'movie-drama']);
    act(() => result.current.setSortBy('newest'));
    expect(ids(result.current.displayedItems)).toEqual(['movie-drama', 'movie-action', 'book-1']);
    act(() => result.current.setSortBy('rating'));
    expect(ids(result.current.displayedItems)).toEqual(['movie-drama', 'book-1', 'movie-action']);
  });

  it('counts the music kind only while music is showing', () => {
    expect(setup({ musicKind: 'album' }).result.current.activeCount).toBe(1);
    expect(setup({ musicKind: 'album', activeType: 'movie' }).result.current.activeCount).toBe(0);
  });

  it('reset clears the filters and the music kind, but keeps the sort', () => {
    const onMusicKindChange = vi.fn();
    const { result } = setup({ onMusicKindChange });
    act(() => {
      result.current.toggleCategory('book');
      result.current.toggleGenre('movie', 'Drama');
      result.current.setMinRating(6);
      result.current.setMinPlays(100);
      result.current.setSortBy('title');
    });
    expect(result.current.activeCount).toBe(4);

    act(() => result.current.reset());
    expect(result.current.activeCount).toBe(0);
    expect(result.current.selectedCategories).toHaveLength(5);
    expect(result.current.sortBy).toBe('title');
    expect(onMusicKindChange).toHaveBeenCalledWith('all');
  });

  it('keeps the plays minimum on the slider when new results change its range', () => {
    const song = (plays: string) =>
      media(`music-${plays}`, { type: 'music', rating: null, playStats: { listeners: '1', playcount: plays } });
    const big = [song('1,000,000')];
    const small = [song('1,000')];
    const { result, rerender } = setup({ source: big });
    expect(result.current.playsRange).toEqual({ max: 1_000_000, step: 10_000 });

    act(() => result.current.setMinPlays(500_000));
    expect(ids(result.current.displayedItems)).toEqual(['music-1,000,000']);

    rerender({ items: small, activeType: 'all', musicKind: 'all' });
    expect(result.current.playsRange).toEqual({ max: 1_000, step: 10 });
    expect(result.current.minPlays).toBe(1_000);
    expect(ids(result.current.displayedItems)).toEqual(['music-1,000']);
  });
});
