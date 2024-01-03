import { useTranslation } from 'react-i18next';
import { useDialog } from '../hooks/useDialog';
import { CONTENT_TYPE_LABELS, MUSIC_KIND_LABELS, type ContentType, type MusicKind } from '../types';
import type { GenreSelection } from '../utils/contentFilters';
import { ChipText } from './ToggleChip';

interface FilterDialogProps {
  showCategories: boolean;
  selectedCategories: ContentType[];
  onToggleCategory: (type: ContentType) => void;
  genreGroups: Array<{ type: ContentType; genres: string[] }>;
  selectedGenres: GenreSelection[];
  onToggleGenre: (type: ContentType, genre: string) => void;
  showMusicKind: boolean;
  musicKind: MusicKind | 'all';
  onMusicKindChange: (kind: MusicKind | 'all') => void;
  showRating: boolean;
  minRating: number;
  onMinRatingChange: (value: number) => void;
  showPlays: boolean;
  minPlays: number;
  playsRange: { max: number; step: number };
  onMinPlaysChange: (value: number) => void;
  onReset: () => void;
  onClose: () => void;
}

export function FilterDialog({
  showCategories,
  selectedCategories,
  onToggleCategory,
  genreGroups,
  selectedGenres,
  onToggleGenre,
  showMusicKind,
  musicKind,
  onMusicKindChange,
  showRating,
  minRating,
  onMinRatingChange,
  showPlays,
  minPlays,
  playsRange,
  onMinPlaysChange,
  onReset,
  onClose,
}: FilterDialogProps) {
  const { t, i18n } = useTranslation();
  const panelRef = useDialog<HTMLDivElement>(onClose);
  const formatPlays = (plays: number) => plays.toLocaleString(i18n.resolvedLanguage);
  // Spoken and shown in words: a bare "0" or "500000" says nothing about what the slider filters.
  const ratingText = minRating > 0
      ? t('filters.ratingOrHigher', { rating: minRating.toFixed(1) })
      : t('filters.anyRating');
  const playsText = minPlays > 0 ? t('filters.playsOrMore', { count: minPlays, plays: formatPlays(minPlays) }) : t('filters.anyPlays');

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="dialog-panel filter-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2 id="filter-title">{t('filters.title')}</h2>
          <button type="button" className="icon-button" aria-label={t('filters.close')} onClick={onClose}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="filter-body">
          {showCategories && (
            <fieldset className="filter-block">
              <legend className="filter-label">{t('filters.categories')}</legend>
              <div className="chip-row">
                {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map((type) => (
                  <label key={type} className="choice-chip">
                    <input
                      type="checkbox"
                      className="visually-hidden"
                      checked={selectedCategories.includes(type)}
                      onChange={() => onToggleCategory(type)}
                    />
                    <ChipText label={CONTENT_TYPE_LABELS[type]} />
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {showMusicKind && (
            <div className="filter-block" role="group" aria-labelledby="music-kind-label">
              <span id="music-kind-label" className="filter-label">{t('filters.musicType')}</span>
              <div className="chip-row">
                {(['all', ...Object.keys(MUSIC_KIND_LABELS)] as Array<MusicKind | 'all'>).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="choice-chip"
                    aria-pressed={musicKind === kind}
                    onClick={() => onMusicKindChange(kind)}
                  >
                    <ChipText label={kind === 'all' ? t('filters.allKinds') : t(`mediaTypes.musicKindsPlural.${kind}`)} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="filter-block">
            <span className="filter-label">{t('filters.genres')}</span>
            {genreGroups.map(({ type, genres }) => (
              <div key={type} className="genre-group" role="group" aria-label={t('filters.genresOf', { type: CONTENT_TYPE_LABELS[type] })}>
                <span className="genre-group-name">{CONTENT_TYPE_LABELS[type]}</span>
                <div className="chip-row">
                  {genres.map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      className="choice-chip"
                      aria-pressed={selectedGenres.some((item) => item.type === type && item.genre === genre)}
                      onClick={() => onToggleGenre(type, genre)}
                    >
                      <ChipText label={genre} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {showRating && (
            <label className="range-field">
              <span>{t('filters.minRating')}</span>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={minRating}
                aria-valuetext={ratingText}
                onChange={(e) => onMinRatingChange(Number(e.target.value))}
              />
              <output>{minRating > 0 ? t('filters.ratingShort', { rating: minRating.toFixed(1) }) : t('filters.any')}</output>
            </label>
          )}

          {showPlays && (
            <label className="range-field">
              <span>{t('filters.minPlays')}</span>
              <input
                type="range"
                min="0"
                max={playsRange.max}
                step={playsRange.step}
                value={minPlays}
                aria-valuetext={playsText}
                onChange={(e) => onMinPlaysChange(Number(e.target.value))}
              />
              <output>{minPlays > 0 ? t('filters.playsShort', { plays: formatPlays(minPlays) }) : t('filters.any')}</output>
            </label>
          )}
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onReset}>
            {t('common.resetFilters')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t('filters.show')}
          </button>
        </div>
      </div>
    </div>
  );
}
