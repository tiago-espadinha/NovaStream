import type { MediaSummary } from "../types";
import { mediaTypeLabel } from "../utils/discovery";
import { fallbackArtwork } from "../utils/gradient";
import HeartIcon from "./HeartIcon";
import { ScoreBadge } from "./ScoreBadge";

interface ContentCardProps {
  item: MediaSummary;
  favorite: boolean;
  onToggleFavorite: (item: MediaSummary) => void;
  onSelect: (id: string) => void;
  collectionIds?: string[];
  collectionOptions?: Array<{ id: string; name: string }>;
  onToggleCollection?: (id: string) => void;
  /** Card titles sit one level below the section that lists them. */
  headingLevel?: 3 | 4;
}

export function ContentCard({
  item,
  favorite,
  onToggleFavorite,
  onSelect,
  collectionIds = [],
  collectionOptions,
  onToggleCollection,
  headingLevel = 3,
}: ContentCardProps) {
  const Title = headingLevel === 4 ? "h4" : "h3";
  return (
    <article className="card" data-id={item.id}>
      <div className="card-art">
        {item.posterUrl ? (
          <img src={item.posterUrl} alt="" loading="lazy" />
        ) : (
          <div className="card-fallback" style={fallbackArtwork(item)}>
            <span aria-hidden="true">{item.title}</span>
          </div>
        )}
      </div>
      <div className="card-body">
        <span className="card-type">{mediaTypeLabel(item)}</span>
        <Title className="card-title">
          <button type="button" className="card-open" onClick={() => onSelect(item.id)}>
            {item.title}
          </button>
        </Title>
        {item.artist && <p className="card-sub">{item.artist}</p>}
        <div className="card-meta">
          <ScoreBadge item={item} />
          {item.releaseYear != null && <span>{item.releaseYear}</span>}
        </div>
      </div>
      <button
        type="button"
        className={`card-save${favorite ? " saved" : ""}`}
        aria-label={`Save ${item.title}`}
        aria-pressed={favorite}
        onClick={() => onToggleFavorite(item)}
      >
        <HeartIcon
          favorite={favorite}
          size="18px"
          primaryColor="var(--color-primary)"
          secondaryColor="var(--color-text)"
        />
      </button>
      {collectionOptions && onToggleCollection && collectionOptions.length > 0 && (
        <details className="card-collection">
          <summary>Collections{collectionIds.length > 0 ? ` · ${collectionIds.length}` : ''}</summary>
          <div className="card-collection-options">
            {collectionOptions.map((collection) => (
              <label key={collection.id}>
                <input
                  type="checkbox"
                  checked={collectionIds.includes(collection.id)}
                  onChange={() => onToggleCollection(collection.id)}
                />
                <span>{collection.name}</span>
              </label>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}
