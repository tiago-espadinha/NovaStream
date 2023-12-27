import { useEffect, useRef } from 'react';
import type { SessionStatus } from '../context/AuthContext';
import { isDialogOpen } from '../hooks/useDialog';
import type { AuthUser, ContentType } from '../types';
import { parseContentQuery } from '../utils/contentFilters';
import { isMacPlatform, isSearchShortcut, searchShortcutLabels } from '../utils/searchShortcut';
import { TypeNav } from './TypeNav';

const isMac = isMacPlatform();
const shortcut = searchShortcutLabels(isMac);

interface HeaderProps {
  activeType: ContentType | 'all';
  onTypeChange: (type: ContentType | 'all') => void;
  query: string;
  onQueryChange: (q: string) => void;
  user: AuthUser | null;
  sessionStatus: SessionStatus;
  onOpenAuth: () => void;
  onOpenAccount: () => void;
  savedPage?: boolean;
}

export function Header({
  activeType,
  onTypeChange,
  query,
  onQueryChange,
  user,
  sessionStatus,
  onOpenAuth,
  onOpenAccount,
  savedPage = false,
}: HeaderProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const keywordKind = parseContentQuery(query).kind;

  useEffect(() => {
    if (savedPage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event, isMac) || isDialogOpen()) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [savedPage]);

  return (
    <header className="site-header">
      <div className="header-bar">
        <a className="logo" href="/">
          NOVA<span>stream</span>
        </a>
        {!savedPage && (
          <form className="search" role="search" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="site-search" className="visually-hidden">
              Search titles, genres, or tags
            </label>
            <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              ref={searchRef}
              id="site-search"
              type="search"
              aria-keyshortcuts={shortcut.aria}
              aria-describedby={keywordKind === 'text' ? undefined : 'search-keyword'}
              placeholder="Search titles, genre: Drama, tag: Indie…"
              autoComplete="off"
              maxLength={200}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
            {!query && (
              <kbd className="search-hint" aria-hidden="true">
                {shortcut.hint}
              </kbd>
            )}
            {keywordKind !== 'text' && (
              <>
                <span className="keyword-kind search-keyword" aria-hidden="true">
                  {keywordKind}
                </span>
                <span id="search-keyword" className="visually-hidden">
                  Searching by {keywordKind}
                </span>
              </>
            )}
            {query && (
              <button
                type="button"
                className="search-clear"
                aria-label="Clear search"
                onClick={() => {
                  onQueryChange('');
                  searchRef.current?.focus();
                }}
              >
                <span aria-hidden="true">✕</span>
              </button>
            )}
          </form>
        )}
        <div className="header-actions">
          <a
            className={`saved-link${savedPage ? ' active' : ''}`}
            href="/saved"
            aria-current={savedPage ? 'page' : undefined}
          >
            Saved
          </a>
          {sessionStatus === 'checking' ? (
            <button type="button" className="account-button" disabled aria-busy="true">
              Signing in…
            </button>
          ) : sessionStatus === 'signedOut' ? (
            <button type="button" className="account-button" onClick={onOpenAuth}>
              Sign in
            </button>
          ) : (
            <button
              type="button"
              className="account-button account-button-user"
              aria-haspopup="dialog"
              aria-label={user ? `Account settings (${user.name})` : 'Account settings'}
              title={user ? `Account settings (${user.name})` : 'Account settings'}
              onClick={onOpenAccount}
            >
              <svg className="account-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
              <span className="account-name">{user?.name ?? 'Account'}</span>
            </button>
          )}
        </div>
      </div>
      {!savedPage && (
        <div className="header-types">
          <TypeNav active={activeType} onChange={onTypeChange} />
        </div>
      )}
    </header>
  );
}
