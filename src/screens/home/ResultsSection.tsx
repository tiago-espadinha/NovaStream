import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ContentGrid } from '../../components/ContentGrid/ContentGrid';
import { KeywordChip } from '../../components/KeywordChip/KeywordChip';
import { Shelf } from '../../components/Shelf/Shelf';
import Spinner from '../../components/Spinner/Spinner';
import { StatusIcon } from '../../components/StatusIcon/StatusIcon';
import type { ContentFilters } from '../../hooks/useContentFilters';
import type { HomeShelves } from '../../hooks/useHomeShelves';
import type { LiveSearch } from '../../hooks/useLiveSearch';
import { CONTENT_TYPE_LABELS, type ContentType, type MediaSummary } from '../../types';
import { parseContentQuery, type SortOption } from '../../utils/contentFilters';
import './ResultsSection.css';

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

interface ResultsSectionProps {
  trimmedQuery: string;
  awaitingLiveQuery: boolean;
  activeType: ContentType | 'all';
  search: LiveSearch;
  filters: ContentFilters;
  shelves: HomeShelves;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (media: MediaSummary) => void;
  onSelect: (id: string) => void;
  onClearQuery: () => void;
  onOpenFilters: () => void;
}

export function ResultsSection({
  trimmedQuery,
  awaitingLiveQuery,
  activeType,
  search,
  filters,
  shelves,
  isFavorite,
  onToggleFavorite,
  onSelect,
  onClearQuery,
  onOpenFilters,
}: ResultsSectionProps) {
  const { t } = useTranslation();
  const { displayedItems, activeCount: activeFilterCount } = filters;

  return (
    <section className="results" aria-labelledby="results-title">
      <div className="results-head">
        <div>
          <h2 id="results-title" tabIndex={-1} data-focus-fallback>
            {headingFor(t, trimmedQuery, awaitingLiveQuery, activeType)}
          </h2>
          <p className="results-count" aria-live="polite">
            {!awaitingLiveQuery &&
              !search.loading &&
              !search.failed &&
              t('shelf.titles', { count: displayedItems.length })}
          </p>
        </div>
        {!awaitingLiveQuery && !search.failed && (
          <div className="results-toolbar">
            <label className="sort-field">
              <span>{t('search.sort')}</span>
              <select value={filters.sortBy} onChange={(e) => filters.setSortBy(e.target.value as SortOption)}>
                <option value="featured">
                  {trimmedQuery ? t('search.sortOptions.bestMatch') : t('search.sortOptions.featured')}
                </option>
                <option value="rating">{t('search.sortOptions.rating')}</option>
                <option value="newest">{t('search.sortOptions.newest')}</option>
                <option value="title">{t('search.sortOptions.title')}</option>
              </select>
            </label>
            <button type="button" className="btn btn-ghost" aria-haspopup="dialog" onClick={onOpenFilters}>
              {activeFilterCount > 0 ? t('filters.buttonCount', { count: activeFilterCount }) : t('filters.button')}
            </button>
          </div>
        )}
      </div>

      {search.error && (
        <div className={`notice ${search.failed ? 'notice-error' : 'notice-warning'}`}>
          {/* A partial outage is informational; only a failed search interrupts screen readers. */}
          <p role={search.failed ? 'alert' : 'status'}>
            <StatusIcon tone={search.failed ? 'error' : 'warning'} />
            {search.error.message}
          </p>
          {search.error.retryable && (
            <button type="button" className="btn btn-ghost" onClick={search.retry}>
              {t('common.tryAgain')}
            </button>
          )}
        </div>
      )}

      {awaitingLiveQuery ? (
        <p className="empty-state">{t('search.prompt')}</p>
      ) : search.loading ? (
        <Spinner label={t('search.searching')} />
      ) : search.failed ? (
        <div className="empty-state">
          <div className="empty-actions">
            <button type="button" className="btn btn-ghost" onClick={onClearQuery}>
              {t('common.clearSearch')}
            </button>
          </div>
        </div>
      ) : displayedItems.length === 0 ? (
        <div className="empty-state">
          <p>{trimmedQuery ? t('search.noMatches', { query: trimmedQuery }) : t('search.noFilterMatches')}</p>
          <div className="empty-actions">
            {trimmedQuery && (
              <button type="button" className="btn btn-ghost" onClick={onClearQuery}>
                {t('common.clearSearch')}
              </button>
            )}
            {activeFilterCount > 0 && (
              <button type="button" className="btn btn-ghost" onClick={filters.reset}>
                {t('common.resetFilters')}
              </button>
            )}
          </div>
        </div>
      ) : shelves.showShelves ? (
        <>
          <Shelf
            id="shelf-mix"
            title={t('app.mixShelf')}
            items={shelves.mixedShelf}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
            onSelect={onSelect}
          />
          {shelves.typeShelves.map(({ type, items }) => (
            <Shelf
              key={type}
              id={`shelf-${type}`}
              title={CONTENT_TYPE_LABELS[type]}
              items={items}
              isFavorite={isFavorite}
              onToggleFavorite={onToggleFavorite}
              onSelect={onSelect}
            />
          ))}
        </>
      ) : (
        <ContentGrid
          items={shelves.shelfItems}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
          onSelect={onSelect}
        />
      )}
    </section>
  );
}
