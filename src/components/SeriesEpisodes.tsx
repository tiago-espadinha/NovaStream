import { useEffect, useRef, useState } from 'react';
import * as api from '../services/apiService';
import type { Episode, SeasonSummary } from '../types';
import { defaultSeason, formatAirDate } from '../utils/episodes';
import { describeSeasonError, type LiveProblem } from '../utils/liveErrors';
import Spinner from './Spinner';

interface SeriesEpisodesProps {
  /** TMDb's series id (the part after "tv-"). */
  externalId: string;
  seasons: SeasonSummary[];
}

/** Season picker and episode list; each season is fetched the first time it's picked. */
export function SeriesEpisodes({ externalId, seasons }: SeriesEpisodesProps) {
  const [selected, setSelected] = useState(() => defaultSeason(seasons));
  const [loaded, setLoaded] = useState<Record<number, Episode[]>>({});
  const [error, setError] = useState<LiveProblem | null>(null);
  const [attempt, setAttempt] = useState(0);
  const selectRef = useRef<HTMLSelectElement>(null);
  const episodes = selected === null ? undefined : loaded[selected];
  const needsFetch = selected !== null && !episodes;
  const selectedSeason = seasons.find((season) => season.number === selected);

  useEffect(() => {
    if (selected === null || !needsFetch) return;
    // A late answer for a season the viewer has already left must not replace the current one.
    let active = true;
    api
      .getTvSeason(externalId, selected)
      .then((season) => active && setLoaded((current) => ({ ...current, [selected]: season.episodes })))
      .catch((err) => active && setError(describeSeasonError(err)));
    return () => {
      active = false;
    };
  }, [externalId, selected, needsFetch, attempt]);

  if (selected === null) return null;

  const pickSeason = (value: string) => {
    setError(null);
    setSelected(Number(value));
  };

  const retry = () => {
    // The retry button unmounts; keep focus on the season picker rather than losing it.
    selectRef.current?.focus();
    setError(null);
    setAttempt((current) => current + 1);
  };

  return (
    <section className="detail-section episodes" aria-labelledby="episodes-title">
      <div className="episodes-header">
        <h3 id="episodes-title" className="meta-label">
          Episodes
        </h3>
        <label className="sort-field episodes-season">
          <span>Season</span>
          <select ref={selectRef} value={selected} onChange={(e) => pickSeason(e.target.value)}>
            {seasons.map((season) => (
              <option key={season.number} value={season.number}>
                {season.name} · {season.episodeCount} {season.episodeCount === 1 ? 'episode' : 'episodes'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="episodes-status" role="alert">
          <p>{error.message}</p>
          {error.retryable && (
            <button type="button" className="btn btn-ghost" onClick={retry}>
              Try again
            </button>
          )}
        </div>
      ) : !episodes ? (
        <Spinner label="Loading episodes…" />
      ) : episodes.length === 0 ? (
        <p className="episodes-status">No episodes listed for this season yet.</p>
      ) : (
        <ol className="tracklist episode-list" aria-label={`${selectedSeason?.name ?? 'Season'} episodes`}>
          {episodes.map((episode) => (
            <li className="track-row episode-row" key={episode.number}>
              <span className="track-number">{episode.number}</span>
              <span className="episode-title">{episode.title}</span>
              <span className="track-duration">{formatAirDate(episode.airDate)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
