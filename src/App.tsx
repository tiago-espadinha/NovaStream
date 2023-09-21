import { useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { ContentGrid } from './components/ContentGrid';
import { mockContent } from './data/mockData';
import * as api from './services/apiService';
import { USE_MOCK } from './config';
import { CONTENT_TYPE_LABELS, type ContentType, type MediaSummary } from './types';
import { describeSearchErrors, describeSearchFailure, type LiveProblem } from './utils/liveErrors';

const ALL_TYPES = Object.keys(CONTENT_TYPE_LABELS) as ContentType[];

function headingFor(query: string, awaitingLiveQuery: boolean, activeType: ContentType | 'all'): string {
  if (query) return `Results for “${query}”`;
  if (awaitingLiveQuery) return 'Search to get started';
  return activeType === 'all' ? 'Browse tonight' : CONTENT_TYPE_LABELS[activeType];
}

export default function App() {
  const [activeType, setActiveType] = useState<ContentType | 'all'>('all');
  const [query, setQuery] = useState('');

  const [liveResults, setLiveResults] = useState<MediaSummary[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<LiveProblem | null>(null);
  const [searchAttempt, setSearchAttempt] = useState(0);

  // --- search ---
  useEffect(() => {
    if (USE_MOCK) return;
    const q = query.trim();
    if (!q) {
      setLiveResults([]);
      setLiveError(null);
      setLiveLoading(false);
      return;
    }
    const controller = new AbortController();
    setLiveLoading(true);
    setLiveError(null);
    const timer = setTimeout(() => {
      api
        .searchMedia(q, activeType)
        .then((res) => {
          if (controller.signal.aborted) return;
          setLiveResults(res.results);
          setLiveError(describeSearchErrors(res.errors, res.results.length, activeType === 'all' ? ALL_TYPES.length : 1));
        })
        .catch((err) => {
          if (!controller.signal.aborted) {
            setLiveResults([]);
            setLiveError(describeSearchFailure(err));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLiveLoading(false);
        });
    }, 350); // debounce so we don't fire a request per keystroke

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, activeType, searchAttempt]);

  const filterItems = USE_MOCK ? mockContent : liveResults;

  const displayedItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return filterItems.filter(
      (item) =>
        (activeType === 'all' || item.type === activeType) &&
        (!USE_MOCK || !q || item.title.toLowerCase().includes(q)),
    );
  }, [filterItems, activeType, query]);

  const trimmedQuery = query.trim();
  const awaitingLiveQuery = !USE_MOCK && !trimmedQuery;
  // A failed live search with nothing returned is an error, not "no matches". Uses the raw
  // results so that filters hiding everything still show the filter empty state.
  const searchFailed = Boolean(liveError) && liveResults.length === 0;
  const resultsHeading = headingFor(trimmedQuery, awaitingLiveQuery, activeType);

  return (
    <>
      <Header
        activeType={activeType}
        onTypeChange={setActiveType}
        query={query}
        onQueryChange={setQuery}
      />

      <main>
        <h1 className="visually-hidden">Discover films, series, music, books and games</h1>
        {awaitingLiveQuery && (
          <section className="intro" aria-labelledby="intro-title">
            <p className="eyebrow">Live discovery</p>
            <h2 id="intro-title">Find your next obsession.</h2>
            <p>
              Search across movies, shows, music, books and games. Results come from live TMDb,
              Last.fm, Open Library, and RAWG data.
            </p>
          </section>
        )}

        <section className="results" aria-labelledby="results-title">
          <div className="results-head">
            <div>
              <h2 id="results-title">{resultsHeading}</h2>
              <p className="results-count" aria-live="polite">
                {!awaitingLiveQuery && !liveLoading && !searchFailed &&
                  `${displayedItems.length} ${displayedItems.length === 1 ? 'title' : 'titles'}`}
              </p>
            </div>
          </div>

          {liveError && (
            <div className={`notice ${searchFailed ? 'notice-error' : 'notice-warning'}`}>
              {/* A partial outage is informational; only a failed search interrupts screen readers. */}
              <p role={searchFailed ? 'alert' : 'status'}>{liveError.message}</p>
              {liveError.retryable && (
                <button type="button" className="btn btn-ghost" onClick={() => setSearchAttempt((n) => n + 1)}>
                  Try again
                </button>
              )}
            </div>
          )}

          {awaitingLiveQuery ? (
            <p className="empty-state">
              Type in the search box above to query the live databases (movies, TV, music, books, games).
            </p>
          ) : liveLoading ? (
            <p className="empty-state">Searching live databases…</p>
          ) : searchFailed ? (
            <div className="empty-state">
              <div className="empty-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setQuery('')}>
                  Clear search
                </button>
              </div>
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="empty-state">
              <p>{trimmedQuery ? `No matches for “${trimmedQuery}”.` : 'No titles match these filters.'}</p>
              <div className="empty-actions">
                {trimmedQuery && (
                  <button type="button" className="btn btn-ghost" onClick={() => setQuery('')}>
                    Clear search
                  </button>
                )}
              </div>
            </div>
          ) : (
            <ContentGrid items={displayedItems} />
          )}
        </section>
      </main>

      <footer className="site-footer">Nova Stream — a React + TypeScript frontend with a real API-backed server.</footer>
    </>
  );
}
