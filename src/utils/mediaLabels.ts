import type { TFunction } from 'i18next';
import type { Episode, MediaLength, SeasonSummary } from '../types';

const pad2 = (value: number) => String(value).padStart(2, '0');

function formatMinutes(t: TFunction, total: number): string {
  const hours = Math.floor(total / 60);
  if (hours === 0) return t('detail.length.minutes', { minutes: total });
  return t('detail.length.hoursMinutes', { hours, minutes: pad2(total % 60) });
}

/** Words a media length ("2h 05m", "3 seasons · 30 episodes", "3:45") from structured data. */
export function formatLength(t: TFunction, length: MediaLength | null): string | null {
  if (!length) return null;
  switch (length.kind) {
    case 'minutes':
      return formatMinutes(t, length.minutes);
    case 'seasons': {
      const seasons =
        length.seasons === null
          ? t('detail.length.seasonsUnknown')
          : t('detail.length.seasons', { count: length.seasons });
      const episodes =
        length.episodes === null
          ? t('detail.length.episodesUnknown')
          : t('detail.length.episodes', { count: length.episodes });
      return `${seasons}${t('detail.length.joiner')}${episodes}`;
    }
    case 'playtime':
      return t('detail.length.playtime', { count: length.hours });
    case 'tracks': {
      const tracks = t('detail.length.tracks', { count: length.tracks });
      return length.minutes
        ? `${tracks}${t('detail.length.joiner')}${t('detail.length.minutes', { minutes: length.minutes })}`
        : tracks;
    }
    case 'duration':
      return `${Math.floor(length.seconds / 60)}:${pad2(length.seconds % 60)}`;
    case 'pages':
      return t('detail.length.pages', { count: length.pages });
  }
}

/** A season's own name, or "Specials" / "Season N" when TMDb has none. */
export function seasonLabel(t: TFunction, season: Pick<SeasonSummary, 'number' | 'name'>): string {
  if (season.name) return season.name;
  return season.number === 0 ? t('detail.season.specials') : t('detail.season.numbered', { number: season.number });
}

/** An episode's title, or "Episode N" when TMDb has none. */
export function episodeTitle(t: TFunction, episode: Pick<Episode, 'number' | 'title'>): string {
  return episode.title || t('detail.episode.numbered', { number: episode.number });
}
