import type { MediaSummary } from "../types";
import playcount from "../utils/playcount";
import PlayIcon from "./PlayIcon";
import StarIcon from "./StarIcon";

interface ScoreBadgeProps {
  item: MediaSummary;
  /** Shown when there is no rating or play count. */
  fallback?: string;
}

export function ScoreBadge({ item, fallback = "—" }: ScoreBadgeProps) {
  if (item.type === "music") {
    const plays = item.rating ?? (
      item.playStats?.playcount ? Number(item.playStats.playcount.replace(/\D/g, "")) : null
    );
    return (
      <span className="score music">
        <span aria-hidden="true"><PlayIcon size="14px" /></span>
        {plays != null ? (
          <>
            <span className="visually-hidden">Plays: </span>
            {playcount(plays)}
          </>
        ) : fallback}
      </span>
    );
  }
  return (
    <span className="score">
      <span aria-hidden="true"><StarIcon size="14px" /></span>
      {item.rating != null ? (
        <>
          <span className="visually-hidden">Rating: </span>
          {item.rating.toFixed(1)}
        </>
      ) : fallback}
    </span>
  );
}
