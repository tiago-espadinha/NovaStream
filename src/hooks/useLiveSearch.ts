import { useEffect, useRef, useState } from 'react';
import { USE_MOCK } from '../config';
import * as api from '../services/apiService';
import { CONTENT_TYPES, type ContentType, type MediaSummary, type MusicKind } from '../types';
import { parseContentQuery } from '../utils/contentFilters';
import { describeSearchErrors, describeSearchFailure, type LiveProblem } from '../utils/liveErrors';
import { reuseAllResults, type AllSearch } from '../utils/searchReuse';

interface LiveSearchOptions {
  query: string;
  activeType: ContentType | 'all';
  musicKind: MusicKind | 'all';
  /** TMDb content comes back in the active language, so searches re-run when it changes. */
  language: string | undefined;
}

export function useLiveSearch({ query, activeType, musicKind, language }: LiveSearchOptions) {
  const [results, setResults] = useState<MediaSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LiveProblem | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The last "All" search, so switching tabs on the same query filters it instead of refetching.
  const allSearch = useRef<AllSearch | null>(null);

  // The remembered "All" search is in the old language; declared first so it clears before the search effect runs.
  useEffect(() => {
    allSearch.current = null;
  }, [language]);

  useEffect(() => {
    if (USE_MOCK) return;
    const parsedQuery = parseContentQuery(query);
    const q = query.trim();
    if (!q || (parsedQuery.kind !== 'text' && !parsedQuery.value)) {
      // oxlint-disable-next-line react/set-state-in-effect -- Nothing to search for: this ends any request in progress.
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    const searchedTypes = activeType === 'all' ? CONTENT_TYPES.length : 1;
    // Only All and Music search by music kind; other tabs always ask for every kind.
    const kind = activeType === 'all' || activeType === 'music' ? musicKind : 'all';
    const reused = reuseAllResults(allSearch.current, q, activeType, kind, attempt);
    if (reused) {
      setResults(reused.results);
      setError(describeSearchErrors(reused.errors, reused.results.length, searchedTypes));
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      api
        .searchMedia(q, activeType, kind)
        .then((res) => {
          if (controller.signal.aborted) return;
          if (activeType === 'all') allSearch.current = { query: q, musicKind: kind, attempt, ...res };
          setResults(res.results);
          setError(describeSearchErrors(res.errors, res.results.length, searchedTypes));
        })
        .catch((err) => {
          if (!controller.signal.aborted) {
            setResults([]);
            setError(describeSearchFailure(err));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 350); // debounce so we don't fire a request per keystroke

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, activeType, musicKind, attempt, language]);

  return {
    results,
    loading,
    error,
    // A failed live search with nothing returned is an error, not "no matches". Uses the raw
    // results so that filters hiding everything still show the filter empty state.
    failed: Boolean(error) && results.length === 0,
    retry: () => setAttempt((n) => n + 1),
  };
}

export type LiveSearch = ReturnType<typeof useLiveSearch>;
