import type { SeasonSummary } from '../types';

/** The season to open first: the lowest regular season, else specials, else none. */
export function defaultSeason(seasons: SeasonSummary[]): number | null {
  const regular = seasons.filter((season) => season.number > 0).map((season) => season.number);
  if (regular.length) return Math.min(...regular);
  return seasons.length ? seasons[0].number : null;
}

/**
 * "5 Jan 2024"-style date for an episode, or "TBA" when there isn't one. The date is read
 * as UTC so a viewer west of Greenwich doesn't see the day before.
 */
export function formatAirDate(airDate: string | null, locale?: string): string {
  const parts = airDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return 'TBA';
  const time = Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    time,
  );
}
