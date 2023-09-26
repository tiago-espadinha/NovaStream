import type { MediaSummary } from "../types";
import { mediaTypeLabel } from "../utils/discovery";
import { fallbackArtwork } from "../utils/gradient";
import { ScoreBadge } from "./ScoreBadge";

interface ContentCardProps {
  item: MediaSummary;
  onSelect: (id: string) => void;
}

export function ContentCard({
  item,
  onSelect,
}: ContentCardProps) {
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
        <h3 className="card-title">
          <button type="button" className="card-open" onClick={() => onSelect(item.id)}>
            {item.title}
          </button>
        </h3>
        {item.artist && <p className="card-sub">{item.artist}</p>}
        <div className="card-meta">
          <ScoreBadge item={item} />
          {item.releaseYear != null && <span>{item.releaseYear}</span>}
        </div>
      </div>
    </article>
  );
}
