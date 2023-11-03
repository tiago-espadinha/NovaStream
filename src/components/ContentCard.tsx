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
  /** Card titles sit one level below the section that lists them. */
  headingLevel?: 3 | 4;
}

export function ContentCard({
  item,
  favorite,
  onToggleFavorite,
  onSelect,
  headingLevel = 3,
}: ContentCardProps) {
  const Title = headingLevel === 4 ? "h4" : "h3";
  return (
    <article className="card">
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
    </article>
  );
}
