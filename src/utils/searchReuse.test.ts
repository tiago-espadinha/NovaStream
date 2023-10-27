import { describe, expect, it } from 'vitest';
import { reuseAllResults, type AllSearch } from './searchReuse';
import type { MediaSummary } from '../types';

const item = (id: string, type: MediaSummary['type']) =>
  ({ id, title: id, type, rating: null, genres: [] }) as MediaSummary;

const results = [item('dune-film', 'movie'), item('dune-book', 'book'), item('dune-2', 'movie'), item('dune-song', 'music')];
const cached: AllSearch = { query: 'dune', musicKind: 'all', attempt: 0, results, errors: [] };

describe('reuseAllResults', () => {
  it('filters the All results to the active type', () => {
    expect(reuseAllResults(cached, 'dune', 'movie', 'all', 0)).toEqual({
      results: [results[0], results[2]],
      errors: [],
    });
  });

  it('returns the full original set, in order, when back on All', () => {
    const reused = reuseAllResults(cached, 'dune', 'all', 'all', 0);
    expect(reused?.results).toBe(results);
  });

  it('returns an empty list for a type All found nothing for', () => {
    expect(reuseAllResults(cached, 'dune', 'game', 'all', 0)).toEqual({ results: [], errors: [] });
  });

  it('needs a request when nothing was searched under All', () => {
    expect(reuseAllResults(null, 'dune', 'movie', 'all', 0)).toBeNull();
  });

  it('needs a request for a different query', () => {
    expect(reuseAllResults(cached, 'arrival', 'movie', 'all', 0)).toBeNull();
    expect(reuseAllResults(cached, 'arrival', 'all', 'all', 0)).toBeNull();
  });

  it('needs a request after a retry', () => {
    expect(reuseAllResults(cached, 'dune', 'movie', 'all', 1)).toBeNull();
  });

  it('needs a request for a music kind All did not search', () => {
    expect(reuseAllResults(cached, 'dune', 'music', 'album', 0)).toBeNull();
    expect(reuseAllResults(cached, 'dune', 'all', 'album', 0)).toBeNull();
    expect(reuseAllResults(cached, 'dune', 'music', 'all', 0)?.results).toEqual([results[3]]);
  });

  it('does not reuse kind-filtered results once the kind is cleared', () => {
    const songs: AllSearch = { ...cached, musicKind: 'song' };
    expect(reuseAllResults(songs, 'dune', 'all', 'all', 0)).toBeNull();
    expect(reuseAllResults(songs, 'dune', 'music', 'all', 0)).toBeNull();
  });

  it('reuses a kind-filtered All search for the same kind and for other types', () => {
    const songs: AllSearch = { ...cached, musicKind: 'song' };
    expect(reuseAllResults(songs, 'dune', 'all', 'song', 0)?.results).toBe(results);
    expect(reuseAllResults(songs, 'dune', 'music', 'song', 0)?.results).toEqual([results[3]]);
    expect(reuseAllResults(songs, 'dune', 'movie', 'all', 0)?.results).toEqual([results[0], results[2]]);
  });

  it('needs a request for a type whose source failed under All', () => {
    const partial: AllSearch = { ...cached, errors: [{ type: 'movie', code: 'timeout' }] };
    expect(reuseAllResults(partial, 'dune', 'movie', 'all', 0)).toBeNull();
    expect(reuseAllResults(partial, 'dune', 'book', 'all', 0)).toEqual({ results: [results[1]], errors: [] });
  });
});
