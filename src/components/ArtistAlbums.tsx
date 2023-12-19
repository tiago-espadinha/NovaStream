import { useEffect, useRef, useState } from 'react';
import * as api from '../services/apiService';
import { ApiError } from '../services/apiService';
import type { MediaSummary } from '../types';
import { describeAlbumsError, type LiveProblem } from '../utils/liveErrors';
import { Shelf } from './Shelf';
import Spinner from './Spinner';

interface ArtistAlbumsProps {
  /** The artist's id after "music-". */
  externalId: string;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (item: MediaSummary) => void;
  /** Opens an album, with the list it was picked from so coming back can reuse it. */
  onSelect: (id: string, albums: MediaSummary[]) => void;
  /** Albums already loaded for this artist (e.g. when coming back from one); skips the request. */
  initialAlbums?: MediaSummary[];
}

/** The artist's most played albums; loads after the rest of the detail so it never holds it up. */
export function ArtistAlbums({
  externalId,
  isFavorite,
  onToggleFavorite,
  onSelect,
  initialAlbums,
}: ArtistAlbumsProps) {
  const [albums, setAlbums] = useState<MediaSummary[] | null>(initialAlbums ?? null);
  const [error, setError] = useState<LiveProblem | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Read once: the parent drops them when it moves on, which must not trigger a request.
  const reusedAlbums = useRef(Boolean(initialAlbums));

  useEffect(() => {
    if (reusedAlbums.current) return;
    let active = true;
    api
      .getArtistAlbums(externalId)
      .then((result) => active && setAlbums(result.albums))
      .catch((err) => {
        if (!active) return;
        // Last.fm answers "not found" for an artist it lists no albums under.
        if (err instanceof ApiError && err.code === 'not_found') setAlbums([]);
        else setError(describeAlbumsError(err));
      });
    return () => {
      active = false;
    };
  }, [externalId, attempt]);

  const retry = () => {
    // The retry button unmounts; keep focus on the section heading.
    document.getElementById('artist-albums-title')?.focus();
    setError(null);
    setAttempt((current) => current + 1);
  };

  return (
    <div className="detail-albums">
      <Shelf
        id="artist-albums"
        title="Albums"
        items={albums ?? []}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        onSelect={(id) => onSelect(id, albums ?? [])}
        notice={
          error ? (
            <div className={`notice ${error.retryable ? 'notice-error' : 'notice-warning'}`}>
              <p role="status">{error.message}</p>
              {error.retryable && (
                <button type="button" className="btn btn-ghost" onClick={retry}>
                  Try again
                </button>
              )}
            </div>
          ) : !albums ? (
            <Spinner label="Loading albums…" />
          ) : (
            albums.length === 0 && <p className="detail-albums-empty">No albums found.</p>
          )
        }
      />
    </div>
  );
}
