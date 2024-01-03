import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Header } from './components/Header';
import { ContentGrid } from './components/ContentGrid';
import { MediaDetail } from './components/MediaDetail';
import { LoginModal } from './components/LoginModal';
import { AccountSettings } from './components/AccountSettings';
import { AccountNotices, type AccountNotice } from './components/AccountNotices';
import { DetailStatus } from './components/DetailStatus';
import { SavedPage } from './components/SavedPage';
import { mockContent, mockTrending } from './data/mockData';
import { useFavorites } from './hooks/useFavorites';
import { useCollections } from './hooks/useCollections';
import { useTrending } from './hooks/useTrending';
import { useAuth } from './context/AuthContext';
import * as api from './services/apiService';
import { USE_MOCK } from './config';
import { CONTENT_TYPE_LABELS, type ContentItem, type ContentType, type MediaSummary, type MusicKind } from './types';
import Spinner from './components/Spinner';
import { Shelf } from './components/Shelf';
import { Spotlight } from './components/Spotlight';
import { FilterDialog } from './components/FilterDialog';
import { KeywordChip } from './components/KeywordChip';
import { SiteFooter } from './components/SiteFooter';
import { StatusIcon } from './components/StatusIcon';
import { groupByType, mixAcrossTypes, pickSpotlight, sampleStable } from './utils/discovery';
import { reuseAllResults, type AllSearch } from './utils/searchReuse';
import { describeDetailError, describeSearchErrors, describeSearchFailure, type LiveProblem } from './utils/liveErrors';
import {
  applyContentFilters,
  COMMON_GENRES_BY_TYPE,
  parseContentQuery,
  playsSliderRange,
  type GenreSelection,
  type SortOption,
} from './utils/contentFilters';

const ALL_TYPES = Object.keys(CONTENT_TYPE_LABELS) as ContentType[];
const FAVORITES_SHELF_LIMIT = 8;

/** A detail left for a related title, kept so Back can return without reloading it. */
interface DetailTrailEntry {
  id: string;
  item: ContentItem;
  /** The artist's albums when they had loaded. */
  albums?: MediaSummary[];
  /** The related title opened from it. */
  openedId: string;
}

function headingFor(
  t: TFunction,
  query: string,
  awaitingLiveQuery: boolean,
  activeType: ContentType | 'all',
): ReactNode {
  const parsed = parseContentQuery(query);
  if (parsed.kind !== 'text' && parsed.value) {
    return (
      <Trans
        i18nKey="search.resultsForKeyword"
        components={{ chip: <KeywordChip kind={parsed.kind} value={parsed.value} /> }}
      />
    );
  }
  if (query) return t('search.resultsForQuery', { query });
  if (awaitingLiveQuery) return t('search.start');
  return activeType === 'all' ? t('search.browse') : CONTENT_TYPE_LABELS[activeType];
}

export default function App() {
  // TMDb content comes back in the active language, so loads below re-run when it changes.
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage;
  const [activeType, setActiveType] = useState<ContentType | 'all'>('all');
  const [musicKind, setMusicKind] = useState<MusicKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<ContentType[]>(ALL_TYPES);
  const [selectedGenres, setSelectedGenres] = useState<GenreSelection[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [minPlays, setMinPlays] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>('featured');

  const [liveResults, setLiveResults] = useState<MediaSummary[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<LiveProblem | null>(null);
  const [searchAttempt, setSearchAttempt] = useState(0);
  // The last "All" search, so switching tabs on the same query filters it instead of refetching.
  const allSearch = useRef<AllSearch | null>(null);
  // One seed per visit: favorites look shuffled but don't jump around as they change.
  const [favoritesSeed] = useState(() => Math.random().toString(36));

  const [detail, setDetail] = useState<ContentItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<LiveProblem | null>(null);
  const [detailAttempt, setDetailAttempt] = useState(0);
  // Details left by opening a related title (an artist's album), oldest first; Back returns
  // to the last one without fetching it again.
  const [detailTrail, setDetailTrail] = useState<DetailTrailEntry[]>([]);
  // Read once by the detail effect, which then skips the fetch.
  const restoredDetail = useRef<DetailTrailEntry | null>(null);
  // The trail entry Back last returned to; its albums and opened card are reused on return.
  const [returnedTo, setReturnedTo] = useState<DetailTrailEntry | null>(null);

  const { user, status: sessionStatus, refreshUser, sessionNotice, clearSessionNotice } = useAuth();

  // Signing out anywhere (another tab, an expired session) closes account settings for good,
  // rather than leaving them open or reopening them at the next sign-in.
  useEffect(() => {
    if (sessionStatus === 'signedOut') setAccountModalOpen(false);
  }, [sessionStatus]);
  const favorites = useFavorites();
  const { isFavorite, toggleFavorite, savedMedia } = favorites;
  const collectionsState = useCollections();
  const trending = useTrending(!USE_MOCK, language);
  const isSavedPage = window.location.pathname.replace(/\/$/, '') === '/saved';

  // Tabs, history, and screen readers name the page by its title.
  useEffect(() => {
    document.title = isSavedPage ? t('app.savedPageTitle') : t('app.pageTitle');
  }, [isSavedPage, t, language]);

  // --- search ---
  // The remembered "All" search is in the old language; declared first so it clears before the search effect runs.
  useEffect(() => {
    allSearch.current = null;
  }, [language]);

  useEffect(() => {
    if (USE_MOCK) return;
    const parsedQuery = parseContentQuery(query);
    const q = query.trim();
    if (!q || (parsedQuery.kind !== 'text' && !parsedQuery.value)) {
      setLiveResults([]);
      setLiveError(null);
      setLiveLoading(false);
      return;
    }
    const searchedTypes = activeType === 'all' ? ALL_TYPES.length : 1;
    // Only All and Music search by music kind; other tabs always ask for every kind.
    const kind = activeType === 'all' || activeType === 'music' ? musicKind : 'all';
    const reused = reuseAllResults(allSearch.current, q, activeType, kind, searchAttempt);
    if (reused) {
      setLiveResults(reused.results);
      setLiveError(describeSearchErrors(reused.errors, reused.results.length, searchedTypes));
      setLiveLoading(false);
      return;
    }
    const controller = new AbortController();
    setLiveLoading(true);
    setLiveError(null);
    const timer = setTimeout(() => {
      api
        .searchMedia(q, activeType, kind)
        .then((res) => {
          if (controller.signal.aborted) return;
          if (activeType === 'all') allSearch.current = { query: q, musicKind: kind, attempt: searchAttempt, ...res };
          setLiveResults(res.results);
          setLiveError(describeSearchErrors(res.errors, res.results.length, searchedTypes));
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
  }, [query, activeType, musicKind, searchAttempt, language]);

  const activeCategories = useMemo(
    () => (activeType === 'all' ? selectedCategories : [activeType]),
    [activeType, selectedCategories],
  );
  const filterItems = USE_MOCK ? mockContent : liveResults;

  // From the unfiltered results, so raising the minimum never shrinks the slider under it.
  const playsRange = useMemo(() => playsSliderRange(filterItems), [filterItems]);

  // Kept on the slider's steps and within its range, so the thumb shows the value that filters.
  useEffect(() => {
    const { max, step } = playsRange;
    setMinPlays((current) => Math.min(Math.round(current / step) * step, max));
  }, [playsRange]);

  const genreGroups = useMemo(() => {
    const types = activeType === 'all' ? selectedCategories : [activeType];
    return types.map((type) => ({ type, genres: COMMON_GENRES_BY_TYPE[type] }));
  }, [activeType, selectedCategories]);

  const displayedItems = useMemo(() => {
    return applyContentFilters(filterItems, {
      activeType,
      selectedCategories: activeCategories,
      selectedGenres,
      query,
      minRating,
      minPlays,
      sortBy,
      providerMatched: !USE_MOCK,
    });
  }, [filterItems, activeType, activeCategories, selectedGenres, query, minRating, minPlays, sortBy]);

  useEffect(() => {
    if (activeType !== 'all') {
      setSelectedGenres((current) => current.filter(({ type }) => type === activeType));
    }
  }, [activeType]);

  // --- detail screen ---
  useEffect(() => {
    setDetailError(null);
    setDetailLoading(false);
    if (!selectedId) {
      setDetail(null);
      setDetailTrail([]);
      setReturnedTo(null);
      restoredDetail.current = null;
      return;
    }
    const restored = restoredDetail.current;
    restoredDetail.current = null;
    if (restored?.id === selectedId) {
      setDetail(restored.item);
      return;
    }
    const mockMatch = mockContent.find((item) => item.id === selectedId);
    if (mockMatch) {
      setDetail(mockMatch);
      return;
    }
    // Live id is shaped "type-externalId" (see server/src/services/normalize.js)
    const [type, ...rest] = selectedId.split('-');
    const externalId = rest.join('-');
    let active = true;
    setDetail(null);
    setDetailLoading(true);
    api
      .getMediaDetail(type as ContentType, externalId)
      .then((item) => active && setDetail(item))
      .catch((err) => active && setDetailError(describeDetailError(err)))
      .finally(() => active && setDetailLoading(false));
    return () => {
      active = false;
    };
  }, [selectedId, detailAttempt, language]);

  const previousDetail = detailTrail[detailTrail.length - 1];
  // The restore sets `detail` to the entry's own item.
  const returnedHere = returnedTo && returnedTo.item === detail ? returnedTo : null;

  const openRelatedDetail = (id: string, albums?: MediaSummary[]) => {
    if (selectedId && detail) {
      setDetailTrail((trail) => [...trail, { id: selectedId, item: detail, albums, openedId: id }]);
    }
    setReturnedTo(null);
    setSelectedId(id);
  };

  const backToPreviousDetail = () => {
    if (!previousDetail) return;
    restoredDetail.current = previousDetail;
    setReturnedTo(previousDetail);
    setDetailTrail((trail) => trail.slice(0, -1));
    setSelectedId(previousDetail.id);
  };

  const toggleCategory = (type: ContentType) => {
    const isSelected = selectedCategories.includes(type);
    setSelectedCategories((current) =>
      isSelected ? current.filter((item) => item !== type) : [...current, type],
    );
    if (isSelected) {
      setSelectedGenres((current) => current.filter((genre) => genre.type !== type));
    }
  };

  const toggleGenre = (type: ContentType, genre: string) => {
    setSelectedGenres((current) => {
      const exists = current.some((item) => item.type === type && item.genre === genre);
      return exists
        ? current.filter((item) => item.type !== type || item.genre !== genre)
        : [...current, { type, genre }];
    });
  };

  const resetFilters = () => {
    setSelectedCategories(ALL_TYPES);
    setSelectedGenres([]);
    setMinRating(0);
    setMinPlays(0);
    setMusicKind('all');
  };

  const trimmedQuery = query.trim();
  const awaitingLiveQuery = !USE_MOCK && !trimmedQuery;
  const browsing = USE_MOCK && !trimmedQuery;
  // A failed live search with nothing returned is an error, not "no matches". Uses the raw
  // results so that filters hiding everything still show the filter empty state.
  const searchFailed = Boolean(liveError) && liveResults.length === 0;
  const spotlight = useMemo(() => (browsing ? pickSpotlight(displayedItems) : null), [browsing, displayedItems]);
  const shelfItems = useMemo(
    () => displayedItems.filter((item) => item.id !== spotlight?.id),
    [displayedItems, spotlight],
  );
  const mixedShelf = useMemo(() => mixAcrossTypes(shelfItems, 12), [shelfItems]);
  const typeShelves = useMemo(() => groupByType(shelfItems), [shelfItems]);
  const showShelves = browsing && activeType === 'all' && shelfItems.length > 0;
  const favoritesShelf = useMemo(
    () => (trimmedQuery ? [] : sampleStable(savedMedia, FAVORITES_SHELF_LIMIT, favoritesSeed)),
    [trimmedQuery, savedMedia, favoritesSeed],
  );
  const trendingItems = useMemo(
    // The spotlight already features its title right above the shelf.
    () => (USE_MOCK ? mockTrending : trending.items).filter((item) => item.id !== spotlight?.id),
    [trending.items, spotlight],
  );
  // Shown before a search while it loads, has items, or has a problem worth explaining;
  // a feed that answered with nothing is simply left out.
  const showTrending = !trimmedQuery && (trendingItems.length > 0 || trending.loading || Boolean(trending.problem));
  // Like search, only a feed with nothing to show is an error; missing types are a warning.
  const trendingFailed = Boolean(trending.problem) && trendingItems.length === 0;
  const activeFilterCount =
    selectedGenres.length +
    (activeType === 'all' && selectedCategories.length < ALL_TYPES.length ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (minPlays > 0 ? 1 : 0) +
    (activeCategories.includes('music') && musicKind !== 'all' ? 1 : 0);
  // Known from the card that opened the detail, so a failed lookup can still name the title.
  const selectedTitle = [...liveResults, ...savedMedia].find((item) => item.id === selectedId)?.title;
  const resultsHeading = headingFor(t, trimmedQuery, awaitingLiveQuery, activeType);

  // The Saved page needs both lists: it's only ready when both are, and an error in either is an error.
  const savedStatuses = [favorites.status, collectionsState.status];
  const savedStatus = savedStatuses.includes('error') ? 'error' : savedStatuses.includes('loading') ? 'loading' : 'ready';

  const accountNotices: AccountNotice[] = [];
  if (sessionNotice) {
    accountNotices.push({
      id: 'session',
      message: sessionNotice,
      tone: 'warning',
      action: {
        label: t('common.signIn'),
        onClick: () => {
          clearSessionNotice();
          setAuthModalOpen(true);
        },
      },
      onDismiss: clearSessionNotice,
    });
  }
  if (accountDeleted) {
    accountNotices.push({
      id: 'account-deleted',
      message: t('app.accountDeleted'),
      tone: 'success',
      onDismiss: () => setAccountDeleted(false),
    });
  }
  if (favorites.notice) {
    accountNotices.push({
      id: 'favorites',
      message: favorites.notice.message,
      tone: favorites.notice.error ? 'error' : 'success',
      action: favorites.notice.offerSignIn
        ? {
            label: t('common.signIn'),
            onClick: () => {
              favorites.dismissNotice();
              setAuthModalOpen(true);
            },
          }
        : undefined,
      onDismiss: favorites.dismissNotice,
    });
  }
  if (collectionsState.saveError) {
    accountNotices.push({
      id: 'collections',
      message: collectionsState.saveError,
      tone: 'error',
      action: collectionsState.status === 'ready' ? { label: t('common.tryAgain'), onClick: collectionsState.retrySave } : undefined,
      onDismiss: collectionsState.dismissSaveError,
    });
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        {t('app.skipToContent')}
      </a>
      <Header
        activeType={activeType}
        onTypeChange={setActiveType}
        query={query}
        onQueryChange={setQuery}
        user={user}
        sessionStatus={sessionStatus}
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenAccount={() => setAccountModalOpen(true)}
        savedPage={isSavedPage}
      />

      {isSavedPage ? (
        <main id="main-content" tabIndex={-1}>
          <AccountNotices notices={accountNotices} />
          <SavedPage
            status={savedStatus}
            signedIn={sessionStatus !== 'signedOut'}
            onRetry={() => {
              if (favorites.status === 'error') favorites.retryLoad();
              if (collectionsState.status === 'error') collectionsState.retryLoad();
              if (sessionStatus === 'unreachable') refreshUser();
            }}
            onSignIn={() => setAuthModalOpen(true)}
            favoriteItems={savedMedia}
            collectionItems={collectionsState.collectionItems}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            onSelect={setSelectedId}
            collections={collectionsState.collections}
            assignments={collectionsState.assignments}
            onCreateCollection={collectionsState.createCollection}
            deleteCollection={collectionsState.deleteCollection}
            toggleCollection={collectionsState.toggleCollection}
          />
        </main>
      ) : (
      <main id="main-content" tabIndex={-1}>
        <AccountNotices notices={accountNotices} />
        <h1 className="visually-hidden">{t('app.heading')}</h1>
        {spotlight && (
          <Spotlight
            item={spotlight}
            favorite={isFavorite(spotlight.id)}
            onToggleFavorite={toggleFavorite}
            onExplore={setSelectedId}
          />
        )}
        {awaitingLiveQuery && (
          <section className="intro" aria-labelledby="intro-title">
            <p className="eyebrow">{t('app.intro.eyebrow')}</p>
            <h2 id="intro-title">{t('app.intro.title')}</h2>
            <p>{t('app.intro.body')}</p>
          </section>
        )}

        {favoritesShelf.length > 0 && (
          <Shelf
            id="shelf-favorites"
            level={2}
            title={t('app.favoritesShelf')}
            items={favoritesShelf}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            onSelect={setSelectedId}
            endAction={
              <a className="shelf-see-all" href="/saved">
                <span>{t('app.seeAllSaved')}</span>
                <span className="shelf-see-all-count">
                  {t('account.favoritesCount', { count: savedMedia.length })}
                </span>
              </a>
            }
          />
        )}
        {showTrending && (
          <Shelf
            id="shelf-trending"
            level={2}
            title={t('app.trendingShelf')}
            items={trendingItems}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            onSelect={setSelectedId}
            notice={
              trending.loading ? (
                <Spinner label={t('app.trendingLoading')} />
              ) : (
                trending.problem && (
                  <div className={`notice ${trendingFailed ? 'notice-error' : 'notice-warning'}`}>
                    <p role="status">
                      <StatusIcon tone={trendingFailed ? 'error' : 'warning'} />
                      {trending.problem.message}
                    </p>
                    {trending.problem.retryable && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          // The button unmounts while retrying; keep keyboard focus in the shelf.
                          document.getElementById('shelf-trending-title')?.focus();
                          trending.retry();
                        }}
                      >
                        {t('common.tryAgain')}
                      </button>
                    )}
                  </div>
                )
              )
            }
          />
        )}

        <section className="results" aria-labelledby="results-title">
          <div className="results-head">
            <div>
              <h2 id="results-title" tabIndex={-1} data-focus-fallback>
                {resultsHeading}
              </h2>
              <p className="results-count" aria-live="polite">
                {!awaitingLiveQuery && !liveLoading && !searchFailed &&
                  t('shelf.titles', { count: displayedItems.length })}
              </p>
            </div>
            {!awaitingLiveQuery && !searchFailed && (
              <div className="results-toolbar">
                <label className="sort-field">
                  <span>{t('search.sort')}</span>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}>
                    <option value="featured">{trimmedQuery ? t('search.sortOptions.bestMatch') : t('search.sortOptions.featured')}</option>
                    <option value="rating">{t('search.sortOptions.rating')}</option>
                    <option value="newest">{t('search.sortOptions.newest')}</option>
                    <option value="title">{t('search.sortOptions.title')}</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-haspopup="dialog"
                  onClick={() => setShowFilters(true)}
                >
                  {activeFilterCount > 0 ? t('filters.buttonCount', { count: activeFilterCount }) : t('filters.button')}
                </button>
              </div>
            )}
          </div>

          {liveError && (
            <div className={`notice ${searchFailed ? 'notice-error' : 'notice-warning'}`}>
              {/* A partial outage is informational; only a failed search interrupts screen readers. */}
              <p role={searchFailed ? 'alert' : 'status'}>
                <StatusIcon tone={searchFailed ? 'error' : 'warning'} />
                {liveError.message}
              </p>
              {liveError.retryable && (
                <button type="button" className="btn btn-ghost" onClick={() => setSearchAttempt((n) => n + 1)}>
                  {t('common.tryAgain')}
                </button>
              )}
            </div>
          )}

          {awaitingLiveQuery ? (
            <p className="empty-state">
              {t('search.prompt')}
            </p>
          ) : liveLoading ? (
            <Spinner label={t('search.searching')} />
          ) : searchFailed ? (
            <div className="empty-state">
              <div className="empty-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setQuery('')}>
                  {t('common.clearSearch')}
                </button>
              </div>
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="empty-state">
              <p>{trimmedQuery ? t('search.noMatches', { query: trimmedQuery }) : t('search.noFilterMatches')}</p>
              <div className="empty-actions">
                {trimmedQuery && (
                  <button type="button" className="btn btn-ghost" onClick={() => setQuery('')}>
                    {t('common.clearSearch')}
                  </button>
                )}
                {activeFilterCount > 0 && (
                  <button type="button" className="btn btn-ghost" onClick={resetFilters}>
                    {t('common.resetFilters')}
                  </button>
                )}
              </div>
            </div>
          ) : showShelves ? (
            <>
              <Shelf
                id="shelf-mix"
                title={t('app.mixShelf')}
                items={mixedShelf}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
                onSelect={setSelectedId}
              />
              {typeShelves.map(({ type, items }) => (
                <Shelf
                  key={type}
                  id={`shelf-${type}`}
                  title={CONTENT_TYPE_LABELS[type]}
                  items={items}
                  isFavorite={isFavorite}
                  onToggleFavorite={toggleFavorite}
                  onSelect={setSelectedId}
                />
              ))}
            </>
          ) : (
            <ContentGrid
              items={shelfItems}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
              onSelect={setSelectedId}
            />
          )}
        </section>

        {showFilters && (
          <FilterDialog
            showCategories={activeType === 'all'}
            selectedCategories={selectedCategories}
            onToggleCategory={toggleCategory}
            genreGroups={genreGroups}
            selectedGenres={selectedGenres}
            onToggleGenre={toggleGenre}
            showMusicKind={activeCategories.includes('music')}
            musicKind={musicKind}
            onMusicKindChange={setMusicKind}
            showRating={activeCategories.some((type) => type !== 'music')}
            minRating={minRating}
            onMinRatingChange={setMinRating}
            showPlays={activeCategories.includes('music')}
            minPlays={minPlays}
            playsRange={playsRange}
            onMinPlaysChange={setMinPlays}
            onReset={resetFilters}
            onClose={() => setShowFilters(false)}
          />
        )}
      </main>
      )}

      <SiteFooter />

      {selectedId && (
        <>
          {(detailLoading || detailError) && (
            <DetailStatus
              title={selectedTitle}
              error={detailError}
              onRetry={() => setDetailAttempt((n) => n + 1)}
              backTo={previousDetail?.item.title}
              onBack={backToPreviousDetail}
              onClose={() => setSelectedId(null)}
            />
          )}
          {detail && (
            <MediaDetail
              // A new dialog per title, so focus moves into it as it does when a card opens one.
              key={detail.id}
              item={detail}
              favorite={isFavorite(detail.id)}
              onToggleFavorite={toggleFavorite}
              isFavorite={isFavorite}
              onOpenRelated={openRelatedDetail}
              backTo={previousDetail?.item.title}
              onBack={backToPreviousDetail}
              initialAlbums={returnedHere?.albums}
              returnFocusTo={returnedHere?.openedId}
              collections={collectionsState.collectionsFor(detail.type)}
              allCollections={collectionsState.collections}
              collectionIds={collectionsState.assignments[detail.id] ?? []}
              collectionsReady={collectionsState.status === 'ready'}
              onToggleCollection={(collectionId) => collectionsState.toggleCollection(detail, collectionId)}
              onCreateCollection={(name, contentTypes) => collectionsState.createCollection(name, contentTypes, detail)}
              onSearchTerm={(searchQuery) => {
                setQuery(searchQuery);
                setSelectedId(null);
              }}
              onClose={() => setSelectedId(null)}
            />
          )}
        </>
      )}

      {authModalOpen && <LoginModal onClose={() => setAuthModalOpen(false)} />}
      {accountModalOpen && sessionStatus !== 'signedOut' && (
        <AccountSettings
          onClose={() => setAccountModalOpen(false)}
          onDeleted={() => {
            setAccountModalOpen(false);
            setAccountDeleted(true);
          }}
        />
      )}
    </>
  );
}
