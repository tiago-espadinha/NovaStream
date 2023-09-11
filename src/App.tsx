import { useMemo, useState } from 'react';
import { Header } from './components/Header';
import { ContentGrid } from './components/ContentGrid';
import { mockContent } from './data/mockData';
import { CONTENT_TYPE_LABELS, type ContentType } from './types';

function headingFor(query: string, activeType: ContentType | 'all'): string {
  if (query) return `Results for “${query}”`;
  return activeType === 'all' ? 'Browse tonight' : CONTENT_TYPE_LABELS[activeType];
}

export default function App() {
  const [activeType, setActiveType] = useState<ContentType | 'all'>('all');
  const [query, setQuery] = useState('');

  const displayedItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mockContent.filter(
      (item) =>
        (activeType === 'all' || item.type === activeType) &&
        (!q || item.title.toLowerCase().includes(q)),
    );
  }, [activeType, query]);

  const trimmedQuery = query.trim();
  const resultsHeading = headingFor(trimmedQuery, activeType);

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
        <section className="results" aria-labelledby="results-title">
          <div className="results-head">
            <div>
              <h2 id="results-title">{resultsHeading}</h2>
              <p className="results-count" aria-live="polite">
                {`${displayedItems.length} ${displayedItems.length === 1 ? 'title' : 'titles'}`}
              </p>
            </div>
          </div>

          {displayedItems.length === 0 ? (
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

      <footer className="site-footer">Nova Stream — a React + TypeScript frontend.</footer>
    </>
  );
}
