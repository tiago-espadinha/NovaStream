import { useTranslation } from "react-i18next";
import { currentLocale } from "../i18n";
import type { MediaSummary } from "../types";
import { parseNumericValue } from "../utils/contentFilters";
import playcount from "../utils/playcount";
import PlayIcon from "./PlayIcon";
import StarIcon from "./StarIcon";

interface ScoreBadgeProps {
  item: MediaSummary;
  /** Shown when there is no rating or play count. */
  fallback?: string;
}

export function ScoreBadge({ item, fallback = "—" }: ScoreBadgeProps) {
  const { t } = useTranslation();
  if (item.type === "music") {
    const plays = item.rating ?? (
      item.playStats?.playcount ? parseNumericValue(item.playStats.playcount) : null
    );
    return (
      <span className="score music">
        <span aria-hidden="true"><PlayIcon size="14px" /></span>
        {plays != null ? (
          <>
            <span className="visually-hidden">{t("scoreBadge.plays")}</span>
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
          <span className="visually-hidden">{t("scoreBadge.rating")}</span>
          {new Intl.NumberFormat(currentLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(item.rating)}
        </>
      ) : fallback}
    </span>
  );
}
