import type { MediaSummary } from '../types';
import { mediaTypeLabel } from '../utils/discovery';
import { fallbackArtwork } from '../utils/gradient';
import { ScoreBadge } from './ScoreBadge';
import HeartIcon from './HeartIcon';

interface SpotlightProps {
  item: MediaSummary & { overview?: string };
  favorite: boolean;
  onToggleFavorite: (item: MediaSummary) => void;
  onExplore: (id: string) => void;
}

export function Spotlight({ item, favorite, onToggleFavorite, onExplore }: SpotlightProps) {
  return (
    <section className="spotlight" aria-labelledby="spotlight-title">
      <div className="spotlight-art">
        {item.posterUrl ? (
          <img src={item.posterUrl} alt={`${item.title} artwork`} />
        ) : (
          <div className="spotlight-fallback" style={fallbackArtwork(item)} aria-hidden="true" />
        )}
      </div>
      <div className="spotlight-copy">
        <p className="eyebrow">Featured after dark · {mediaTypeLabel(item)}</p>
        <h2 id="spotlight-title" className="spotlight-title">
          {item.title}
        </h2>
        <p className="spotlight-meta">
          <ScoreBadge item={item} />
          {item.releaseYear != null && <span>{item.releaseYear}</span>}
          {item.genres.length > 0 && <span>{item.genres.slice(0, 2).join(' / ')}</span>}
        </p>
        {item.overview && <p className="spotlight-synopsis">{item.overview}</p>}
        <div className="spotlight-actions">
          <button type="button" className="btn btn-primary" onClick={() => onExplore(item.id)}>
            Explore
          </button>
          <button
            type="button"
            className={`btn btn-ghost${favorite ? ' saved' : ''}`}
            aria-pressed={favorite}
            onClick={() => onToggleFavorite(item)}
          >
            <span aria-hidden="true">
              <HeartIcon
                favorite={favorite}
                size="18px"
                primaryColor="var(--color-primary)"
                secondaryColor="var(--color-text)"
              />
            </span>
            {favorite ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </section>
  );
}
