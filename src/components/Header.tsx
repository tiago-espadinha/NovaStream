import type { ContentType } from '../types';
import { TypeNav } from './TypeNav';

interface HeaderProps {
  activeType: ContentType | 'all';
  onTypeChange: (type: ContentType | 'all') => void;
  query: string;
  onQueryChange: (q: string) => void;
}

export function Header({
  activeType,
  onTypeChange,
  query,
  onQueryChange,
}: HeaderProps) {
  return (
    <header className="site-header">
      <div className="header-bar">
        <a className="logo" href="/">
          NOVA<span>stream</span>
        </a>
        <form className="search" role="search" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="site-search" className="visually-hidden">
              Search titles, genres, or tags
            </label>
            <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              id="site-search"
              type="search"
              placeholder="Search titles, genre: Drama, tag: Indie…"
              autoComplete="off"
              maxLength={200}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="search-clear"
                aria-label="Clear search"
                onClick={() => {
                  onQueryChange('');
                  document.getElementById('site-search')?.focus();
                }}
              >
                <span aria-hidden="true">✕</span>
              </button>
            )}
          </form>
      </div>
      <div className="header-types">
        <TypeNav active={activeType} onChange={onTypeChange} />
      </div>
    </header>
  );
}
