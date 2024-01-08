import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccountNotices, type AccountNotice } from '../../components/AccountNotices/AccountNotices';
import { Shelf } from '../../components/Shelf/Shelf';
import Spinner from '../../components/Spinner/Spinner';
import { StatusIcon } from '../../components/StatusIcon/StatusIcon';
import type { ContentFilters } from '../../hooks/useContentFilters';
import type { HomeShelves } from '../../hooks/useHomeShelves';
import type { LiveSearch } from '../../hooks/useLiveSearch';
import type { useTrending } from '../../hooks/useTrending';
import type { ContentType, MediaSummary } from '../../types';
import { FilterDialog } from './FilterDialog';
import { ResultsSection } from './ResultsSection';
import { Spotlight } from './Spotlight';
import './HomeScreen.css';

interface HomeScreenProps {
  notices: AccountNotice[];
  trimmedQuery: string;
  awaitingLiveQuery: boolean;
  activeType: ContentType | 'all';
  search: LiveSearch;
  filters: ContentFilters;
  shelves: HomeShelves;
  trending: ReturnType<typeof useTrending>;
  savedCount: number;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (media: MediaSummary) => void;
  onSelect: (id: string) => void;
  onClearQuery: () => void;
}

export function HomeScreen({
  notices,
  trimmedQuery,
  awaitingLiveQuery,
  activeType,
  search,
  filters,
  shelves,
  trending,
  savedCount,
  isFavorite,
  onToggleFavorite,
  onSelect,
  onClearQuery,
}: HomeScreenProps) {
  const { t } = useTranslation();
  const [showFilters, setShowFilters] = useState(false);
  const { spotlight, favoritesShelf, showTrending, trendingItems, trendingFailed } = shelves;

  return (
    <main id="main-content" tabIndex={-1}>
      <AccountNotices notices={notices} />
      <h1 className="visually-hidden">{t('app.heading')}</h1>
      {spotlight && (
        <Spotlight
          item={spotlight}
          favorite={isFavorite(spotlight.id)}
          onToggleFavorite={onToggleFavorite}
          onExplore={onSelect}
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
          onToggleFavorite={onToggleFavorite}
          onSelect={onSelect}
          endAction={
            <a className="shelf-see-all" href="/saved">
              <span>{t('app.seeAllSaved')}</span>
              <span className="shelf-see-all-count">{t('account.favoritesCount', { count: savedCount })}</span>
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
          onToggleFavorite={onToggleFavorite}
          onSelect={onSelect}
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

      <ResultsSection
        trimmedQuery={trimmedQuery}
        awaitingLiveQuery={awaitingLiveQuery}
        activeType={activeType}
        search={search}
        filters={filters}
        shelves={shelves}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        onSelect={onSelect}
        onClearQuery={onClearQuery}
        onOpenFilters={() => setShowFilters(true)}
      />

      {showFilters && (
        <FilterDialog
          showCategories={activeType === 'all'}
          selectedCategories={filters.selectedCategories}
          onToggleCategory={filters.toggleCategory}
          genreGroups={filters.genreGroups}
          selectedGenres={filters.selectedGenres}
          onToggleGenre={filters.toggleGenre}
          showMusicKind={filters.activeCategories.includes('music')}
          musicKind={filters.musicKind}
          onMusicKindChange={filters.setMusicKind}
          showRating={filters.activeCategories.some((type) => type !== 'music')}
          minRating={filters.minRating}
          onMinRatingChange={filters.setMinRating}
          showPlays={filters.activeCategories.includes('music')}
          minPlays={filters.minPlays}
          playsRange={filters.playsRange}
          onMinPlaysChange={filters.setMinPlays}
          onReset={filters.reset}
          onClose={() => setShowFilters(false)}
        />
      )}
    </main>
  );
}
