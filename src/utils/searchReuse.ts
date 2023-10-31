import type { SearchResponse } from '../services/apiService';
import type { ContentType, MusicKind } from '../types';

/** The last search run under "All": the query, music kind and retry attempt it answered, and its response. */
export interface AllSearch extends SearchResponse {
  query: string;
  musicKind: MusicKind | 'all';
  attempt: number;
}

/**
 * The response for a search that an earlier "All" search already answered, or null when a new
 * request is needed. "All" queries each type with the same provider call a type tab would, so
 * its results for one type are what that tab would fetch. The music kind only shapes the music
 * results, so All and the Music tab need the same kind while other tabs reuse it regardless.
 * A type whose source failed, a different query or a retry still go to the server.
 */
export function reuseAllResults(
  cached: AllSearch | null,
  query: string,
  activeType: ContentType | 'all',
  musicKind: MusicKind | 'all',
  attempt: number,
): SearchResponse | null {
  if (!cached || cached.query !== query || cached.attempt !== attempt) return null;
  if ((activeType === 'all' || activeType === 'music') && cached.musicKind !== musicKind) return null;
  if (activeType === 'all') return { results: cached.results, errors: cached.errors };
  if (cached.errors.some((error) => error.type === activeType)) return null;
  return { results: cached.results.filter((item) => item.type === activeType), errors: [] };
}
