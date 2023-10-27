import { describe, expect, it } from 'vitest';
import { applyContentFilters, DEFAULT_PLAYS_RANGE, playsSliderRange } from './contentFilters';
import type { MediaSummary } from '../types';

const items: MediaSummary[] = [
  { id: '1', title: 'Zeta', type: 'movie', rating: 7.4, genres: ['Action'] },
  { id: '2', title: 'Alpha', type: 'tv', rating: 9.2, genres: ['Drama'] },
  { id: '3', title: 'Beta', type: 'movie', rating: 8.1, genres: ['Mystery'] },
  { id: '7', title: 'Delta', type: 'movie', rating: 8.5, genres: ['Drama'] },
  { id: '4', title: 'Gamma', type: 'book', rating: 6.5, genres: ['Fiction'] },
  { id: '5', title: 'Night Signal', type: 'music', rating: 14000, genres: ['Indie'], playStats: { listeners: '9000', playcount: '14000' } },
  { id: '6', title: 'Rain Echo', type: 'music', rating: 20000, genres: ['Indie'], playStats: { listeners: '12000', playcount: '20000' } },
];

describe('applyContentFilters', () => {
  it('returns no items when every category is deselected', () => {
    const result = applyContentFilters(items, {
      activeType: 'all',
      selectedCategories: [],
      minRating: 0,
      sortBy: 'featured',
      query: '',
    });

    expect(result).toEqual([]);
  });

  it('filters by category and genre in all mode, then sorts by top rating', () => {
    const result = applyContentFilters(items, {
      activeType: 'all',
      selectedCategories: ['movie'],
      selectedGenres: [{ type: 'movie', genre: 'Mystery' }],
      minRating: 0,
      sortBy: 'rating',
      query: '',
    });

    expect(result.map((item) => item.id)).toEqual(['3']);
  });

  it('filters same-named genres independently by content type', () => {
    const result = applyContentFilters(items, {
      activeType: 'all',
      selectedCategories: ['movie', 'tv', 'music'],
      selectedGenres: [{ type: 'movie', genre: 'Drama' }],
      minRating: 0,
      sortBy: 'title',
      query: '',
    });

    expect(result.map((item) => item.id)).toEqual(['7']);
  });

  it('uses playcount instead of rating for music and sorts by score', () => {
    const result = applyContentFilters(items, {
      activeType: 'all',
      selectedCategories: ['music'],
      selectedGenres: [{ type: 'music', genre: 'Indie' }],
      minRating: 0,
      minPlays: 15000,
      sortBy: 'rating',
      query: '',
    });

    expect(result.map((item) => item.id)).toEqual(['6']);
  });

  it('applies the minimum plays threshold only to music in mixed category results', () => {
    const result = applyContentFilters(items, {
      activeType: 'all',
      selectedCategories: ['movie', 'music'],
      minRating: 8,
      minPlays: 15000,
      sortBy: 'title',
      query: '',
    });

    expect(result.map((item) => item.id)).toEqual(['3', '7', '6']);
  });

  it('matches query across the title and sorts alphabetically', () => {
    const result = applyContentFilters(items, {
      activeType: 'all',
      selectedCategories: ['movie', 'tv', 'book', 'music'],
      minRating: 0,
      sortBy: 'title',
      query: 'a',
    });

    expect(result.map((item) => item.title)).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma', 'Night Signal', 'Rain Echo', 'Zeta']);
  });

  it('filters by a genre query without matching the title', () => {
    const result = applyContentFilters(items, {
      activeType: 'all',
      minRating: 0,
      sortBy: 'title',
      query: 'genre: Mystery',
    });

    expect(result.map((item) => item.id)).toEqual(['3']);
  });

  it('filters by a tag query, including provider tags stored as genres', () => {
    const taggedItems = [
      ...items,
      { id: '8', title: 'Quiet Orbit', type: 'music' as const, rating: 5, genres: ['Ambient'], tags: ['Space rock'] },
    ];
    const result = applyContentFilters(taggedItems, {
      activeType: 'all',
      minRating: 0,
      sortBy: 'title',
      query: 'tag: space rock',
    });
    const genreFallback = applyContentFilters(items, {
      activeType: 'all',
      minRating: 0,
      sortBy: 'title',
      query: 'tag: indie',
    });

    expect(result.map((item) => item.id)).toEqual(['8']);
    expect(genreFallback.map((item) => item.id)).toEqual(['5', '6']);
  });
  
  it('matches a single word within multiword music genres and tags', () => {
    const taggedMusic: MediaSummary[] = [
      { id: '9', title: 'Quiet Motion', type: 'music', rating: 8, genres: ['Indie Rock'], tags: [] },
      { id: '10', title: 'Soft Current', type: 'music', rating: 8, genres: ['Electronic'], tags: ['Dream Pop Indie'] },
    ];
    const genreResults = applyContentFilters(taggedMusic, {
      activeType: 'all', minRating: 0, sortBy: 'title', query: 'genre: indie',
    });
    const tagResults = applyContentFilters(taggedMusic, {
      activeType: 'all', minRating: 0, sortBy: 'title', query: 'tag: indie',
    });

    expect(genreResults.map((item) => item.id)).toEqual(['9']);
    expect(tagResults.map((item) => item.id)).toEqual(['10']);
  });
});
    it('matches plain-text music searches against the artist', () => {
      const artistItems = [
        { id: '9', title: 'Blue Train', type: 'music' as const, rating: 8, genres: ['Jazz'], artist: 'John Coltrane' },
      ];
      const result = applyContentFilters(artistItems, {
        activeType: 'all',
        minRating: 0,
        sortBy: 'title',
        query: 'John Coltrane',
      });

      expect(result.map((item) => item.id)).toEqual(['9']);
    });

describe('applyContentFilters close matching', () => {
  it('finds titles despite typos, accents, and partial words', () => {
    const catalog: MediaSummary[] = [
      { id: 'a', title: 'Hades II: Echoes', type: 'game', rating: 9, genres: [] },
      { id: 'b', title: 'Pokémon Legends', type: 'game', rating: 8, genres: [] },
      { id: 'c', title: 'Signal Lost', type: 'game', rating: 7, genres: [] },
    ];
    const search = (query: string) =>
      applyContentFilters(catalog, { activeType: 'all', minRating: 0, sortBy: 'featured', query }).map((item) => item.id);

    expect(search('hadez echos')).toEqual(['a']);
    expect(search('pokemon leg')).toEqual(['b']);
    expect(search('zelda')).toEqual([]);
  });

  it('ranks closer matches first under the featured sort', () => {
    const catalog: MediaSummary[] = [
      { id: 'typo', title: 'Midnight Apperture', type: 'movie', rating: 9.9, genres: [] },
      { id: 'exact', title: 'Midnight Aperture', type: 'movie', rating: 5, genres: [] },
    ];
    const result = applyContentFilters(catalog, {
      activeType: 'all',
      minRating: 0,
      sortBy: 'featured',
      query: 'midnight aperture',
    });
    expect(result.map((item) => item.id)).toEqual(['exact', 'typo']);
  });

  it('keeps provider-matched live results that differ from the typed text, closest first', () => {
    const live: MediaSummary[] = [
      { id: 'alt', title: 'Arrakis Chronicles', type: 'book', rating: 8, genres: [] },
      { id: 'close', title: 'Dune Messiah', type: 'book', rating: 7, genres: [] },
    ];
    const result = applyContentFilters(live, {
      activeType: 'all',
      minRating: 0,
      sortBy: 'featured',
      query: 'dune',
      providerMatched: true,
    });
    expect(result.map((item) => item.id)).toEqual(['close', 'alt']);
  });
});

describe('playsSliderRange', () => {
  const song = (id: string, playcount: string) =>
    ({ id, title: id, type: 'music', rating: null, genres: [], playStats: { listeners: '0', playcount } }) as MediaSummary;

  it('tops out at the highest music play count, rounded down to a readable step', () => {
    expect(playsSliderRange(items)).toEqual({ max: 20000, step: 200 });
    expect(playsSliderRange([song('a', '1234567'), song('b', '900')])).toEqual({ max: 1220000, step: 20000 });
  });

  it('ignores the ratings of other types', () => {
    expect(playsSliderRange([...items, { id: 'x', title: 'X', type: 'movie', rating: 9_999_999, genres: [] }])).toEqual({
      max: 20000,
      step: 200,
    });
  });

  it('keeps whole-number steps for tiny play counts', () => {
    expect(playsSliderRange([song('a', '37')])).toEqual({ max: 37, step: 1 });
  });

  it('falls back to the default range without music play counts', () => {
    expect(playsSliderRange([])).toEqual(DEFAULT_PLAYS_RANGE);
    expect(playsSliderRange(items.filter((item) => item.type !== 'music'))).toEqual(DEFAULT_PLAYS_RANGE);
  });
});
