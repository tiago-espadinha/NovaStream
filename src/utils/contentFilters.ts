import type { ContentType, MediaSummary } from '../types';
import { matchScore } from './fuzzyMatch';

export type SortOption = 'featured' | 'rating' | 'newest' | 'title';
export interface GenreSelection {
  type: ContentType;
  genre: string;
}

export const COMMON_GENRES_BY_TYPE: Record<ContentType, string[]> = {
  movie: ['Action', 'Drama', 'Comedy', 'Thriller', 'Horror', 'Sci-Fi', 'Adventure', 'Romance', 'Animation', 'Documentary'],
  tv: ['Drama', 'Comedy', 'Thriller', 'Mystery', 'Fantasy', 'Sci-Fi', 'Crime', 'Action', 'Documentary', 'Family'],
  music: ['Pop', 'Rock', 'Indie', 'Electronic', 'Hip-Hop', 'Jazz', 'R&B', 'Classical', 'Country', 'Soul'],
  book: ['Fiction', 'Mystery', 'Fantasy', 'Romance', 'Sci-Fi', 'Thriller', 'Historical', 'Nonfiction', 'Young Adult', 'Biography'],
  game: ['Action', 'RPG', 'Adventure', 'Strategy', 'Simulation', 'Sports', 'Racing', 'Puzzle', 'Survival', 'Horror'],
};

export interface ContentFilterOptions {
  activeType: ContentType | 'all';
  selectedCategories?: ContentType[];
  selectedGenres?: GenreSelection[];
  query: string;
  minRating: number;
  minPlays?: number;
  sortBy: SortOption;
  /**
   * Live results were already matched to the text query by the provider (which handles
   * typos and alternate titles), so they're ranked by closeness but not filtered out.
   */
  providerMatched?: boolean;
}

export type QueryKeyword = 'genre' | 'tag';

export function parseContentQuery(query: string): { kind: 'text' | QueryKeyword; value: string } {
  const match = query.trim().match(/^(genre|tag):\s*(.*)$/i);
  if (!match) return { kind: 'text', value: query.trim() };
  return { kind: match[1].toLowerCase() as QueryKeyword, value: match[2].trim() };
}

function matchesLabel(labels: string[], query: string): boolean {
  const normalizedQuery = query.toLowerCase();
  return labels.some((label) => label.toLowerCase().includes(normalizedQuery));
}

/** Reads a count the server sent as English-formatted text ("1,234,567"); 0 when it isn't a number. */
export function parseNumericValue(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getMusicPlayCount(item: MediaSummary): number {
  if (item.playStats?.playcount) {
    return parseNumericValue(item.playStats.playcount);
  }
  return parseNumericValue(item.rating);
}

/** Used before any music result exists to size the range from. */
export const DEFAULT_PLAYS_RANGE = { max: 500_000, step: 5_000 };

/**
 * The Minimum plays slider's range: up to the top play count among the music results, rounded
 * down to a 1/2/5 step of roughly a hundredth of it so the slider moves in readable amounts and
 * its far end still keeps the top result.
 */
export function playsSliderRange(items: MediaSummary[]): { max: number; step: number } {
  const top = Math.max(0, ...items.filter((item) => item.type === 'music').map(getMusicPlayCount));
  if (top <= 0) return DEFAULT_PLAYS_RANGE;
  const rough = top / 100;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((size) => size >= rough)!);
  return { max: Math.floor(top / step) * step, step };
}

function getComparableScore(item: MediaSummary): number {
  if (item.type === 'music') {
    return getMusicPlayCount(item);
  }
  return Number(item.rating ?? 0);
}

export function applyContentFilters(
  items: MediaSummary[],
  {
    activeType,
    selectedCategories,
    selectedGenres = [],
    query,
    minRating,
    minPlays = 0,
    sortBy,
    providerMatched = false,
  }: ContentFilterOptions,
): MediaSummary[] {
  const parsedQuery = parseContentQuery(query);
  const normalizedQuery = parsedQuery.value.toLowerCase();
  const selectedTypes = selectedCategories ?? (activeType === 'all' ? null : [activeType]);
  const normalizedGenres = new Set(
    selectedGenres.map(({ type, genre }) => `${type}:${genre.toLowerCase()}`),
  );

  const textQuery = parsedQuery.kind === 'text' && normalizedQuery.length > 0;
  // Lower is closer; NO_MATCH ranks last (and is dropped unless provider-matched).
  const NO_MATCH = 3;
  const closeness = new Map<MediaSummary, number>();
  if (textQuery) {
    for (const item of items) {
      const scores = [matchScore(item.title, normalizedQuery)];
      if (item.type === 'music' && item.artist) scores.push(matchScore(item.artist, normalizedQuery));
      const best = Math.min(...scores.map((score) => score ?? NO_MATCH));
      closeness.set(item, best);
    }
  }

  const filtered = items.filter((item) => {
    const matchesType = selectedTypes === null || selectedTypes.includes(item.type);
    const matchesQuery =
      parsedQuery.kind === 'text'
        ? !textQuery || providerMatched || closeness.get(item) !== NO_MATCH
        : normalizedQuery.length > 0 &&
          (parsedQuery.kind === 'genre'
            ? matchesLabel(item.genres, normalizedQuery)
            : matchesLabel(
                item.type === 'music' && item.tags !== undefined
                  ? item.tags
                  : [...(item.tags ?? []), ...item.genres],
                normalizedQuery,
              ));
    const matchesGenre =
      normalizedGenres.size === 0 ||
      item.genres.some((genre) => normalizedGenres.has(`${item.type}:${genre.toLowerCase()}`));
    const matchesRating =
      item.type === 'music'
        ? getMusicPlayCount(item) >= minPlays
        : Number(item.rating ?? 0) >= minRating;

    return matchesType && matchesQuery && matchesGenre && matchesRating;
  });

  const next = [...filtered];

  switch (sortBy) {
    case 'title':
      return next.sort((a, b) => a.title.localeCompare(b.title));
    case 'newest':
      return next.sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0));
    case 'rating':
      return next.sort((a, b) => getComparableScore(b) - getComparableScore(a));
    case 'featured':
    default:
      // While searching, "featured" means best match; ties keep the provider's own order.
      if (textQuery) return next.sort((a, b) => (closeness.get(a) ?? 0) - (closeness.get(b) ?? 0));
      return next.sort((a, b) => {
        const aScore = getComparableScore(a) * 10 + (a.releaseYear ?? 0);
        const bScore = getComparableScore(b) * 10 + (b.releaseYear ?? 0);
        return bScore - aScore;
      });
  }
}
