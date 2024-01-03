import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../hooks/useDialog";
import type { ContentItem, ContentType, MediaSummary } from "../types";
import type { SavedCollection } from "../utils/collections";
import { mediaTypeLabel } from "../utils/discovery";
import { fallbackArtwork } from "../utils/gradient";
import { formatLength } from "../utils/mediaLabels";
import { ScoreBadge } from "./ScoreBadge";
import HeartIcon from "./HeartIcon";
import { CollectionMenu } from "./CollectionMenu";
import { ArtworkViewer } from "./ArtworkViewer";
import { SeriesEpisodes } from "./SeriesEpisodes";
import { ArtistAlbums } from "./ArtistAlbums";

interface MediaDetailProps {
  item: ContentItem;
  favorite: boolean;
  onToggleFavorite: (item: MediaSummary) => void;
  /** Whether a related title (e.g. one of an artist's albums) is a favorite. */
  isFavorite: (id: string) => boolean;
  /** Opens a related title from inside this detail. */
  onOpenRelated: (id: string, albums?: MediaSummary[]) => void;
  /** Title of the detail this one was opened from, for the Back button. */
  backTo?: string;
  onBack: () => void;
  /** The artist's albums kept from before an album was opened, so coming back skips the request. */
  initialAlbums?: MediaSummary[];
  /** The related title this detail was left for; its card takes focus on return when it's still there. */
  returnFocusTo?: string;
  collections: SavedCollection[];
  allCollections: SavedCollection[];
  collectionIds: string[];
  collectionsReady: boolean;
  onToggleCollection: (collectionId: string) => void;
  onCreateCollection: (name: string, contentTypes: ContentType[]) => SavedCollection | null;
  onSearchTerm: (query: string) => void;
  onClose: () => void;
}

export function MediaDetail({
  item,
  favorite,
  onToggleFavorite,
  isFavorite,
  onOpenRelated,
  backTo,
  onBack,
  initialAlbums,
  returnFocusTo,
  collections,
  allCollections,
  collectionIds,
  collectionsReady,
  onToggleCollection,
  onCreateCollection,
  onSearchTerm,
  onClose,
}: MediaDetailProps) {
  const { t } = useTranslation();
  const length = formatLength(t, item.length);
  const panelRef = useDialog<HTMLDivElement>(onClose);
  const [viewingArtwork, setViewingArtwork] = useState(false);

  // After useDialog has focused Close, which stays the fallback when the card is gone.
  useEffect(() => {
    if (!returnFocusTo) return;
    panelRef.current
      ?.querySelector<HTMLElement>(`[data-id="${CSS.escape(returnFocusTo)}"] .card-open`)
      ?.focus();
    // Only on opening: later re-renders must not pull focus back.
  }, []);
  const streamingPlatforms = item.platforms
    .filter((platform) => platform.startsWith("Streaming on "))
    .map((platform) => platform.slice("Streaming on ".length));
  const genres = item.genres.filter(
    (genre) => !item.tags?.some((tag) => tag.toLowerCase() === genre.toLowerCase()),
  );

  return (
    <div className="dialog-backdrop detail-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Before Close so Tab follows the screen, left to right; Close still takes first focus. */}
        {backTo && (
          <button type="button" className="btn btn-ghost detail-back" onClick={onBack}>
            <span aria-hidden="true">‹ </span>Back to {backTo}
          </button>
        )}
        <button
          type="button"
          className="icon-button detail-close"
          aria-label="Close details"
          data-autofocus
          onClick={onClose}
        >
          <span aria-hidden="true">✕</span>
        </button>

        <div className="detail-hero">
          {item.posterUrl && (
            <div className="detail-hero-backdrop">
              <img src={item.posterUrl} alt="" />
            </div>
          )}
          <div className="detail-art">
            {item.posterUrl ? (
              <button
                type="button"
                className="detail-art-open"
                aria-label={`View full artwork for ${item.title}`}
                onClick={() => setViewingArtwork(true)}
              >
                <img src={item.posterUrl} alt="" />
              </button>
            ) : (
              <div className="detail-fallback" style={fallbackArtwork(item)} aria-hidden="true" />
            )}
          </div>
          <div className="detail-heading">
            <p className="eyebrow">{mediaTypeLabel(item)}</p>
            <h2 id="detail-title">{item.title}</h2>
            <p className="detail-subline">
              <ScoreBadge item={item} fallback="Not yet rated" />
              {item.releaseYear != null && <span>{item.releaseYear}</span>}
              {length && <span>{length}</span>}
            </p>
            <div className="detail-actions">
              <button
                type="button"
                className={`btn ${favorite ? "btn-ghost saved" : "btn-primary"} detail-save`}
                aria-pressed={favorite}
                onClick={() => onToggleFavorite(item)}
              >
                <span aria-hidden="true">
                  <HeartIcon
                    favorite={favorite}
                    size="18px"
                    primaryColor="var(--color-primary)"
                    secondaryColor="var(--color-on-primary)"
                  />
                </span>
                {favorite ? "Saved to favorites" : "Save to favorites"}
              </button>
              {collections.length > 0 && (
                <CollectionMenu
                  itemType={item.type}
                  collections={collections}
                  allCollections={allCollections}
                  collectionIds={collectionIds}
                  ready={collectionsReady}
                  onToggleCollection={onToggleCollection}
                  onCreateCollection={onCreateCollection}
                />
              )}
            </div>
          </div>
        </div>

        <div className="detail-body">
          {(genres.length > 0 || (item.tags ?? []).length > 0) && (
            <div className="detail-genres" aria-label="Search by genre or tag" role="group">
              {genres.map((g) => (
                <button type="button" className="genre-chip" key={`genre-${g}`} onClick={() => onSearchTerm(`genre: ${g}`)}>
                  {g}
                </button>
              ))}
              {(item.tags ?? []).map((tag) => (
                <button
                  type="button"
                  className="genre-chip tag-chip"
                  key={`tag-${tag}`}
                  onClick={() => onSearchTerm(`tag: ${tag}`)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          <h3 className="meta-label">Overview</h3>
          <p className="detail-overview">{item.overview || "No synopsis available."}</p>

          <dl className="detail-meta-grid">
            {item.musicKind !== "artist" && (
              <div>
                <dt className="meta-label">{t(`detail.creatorRole.${item.creatorRole}`)}</dt>
                <dd className="meta-value">{item.creator ?? t('detail.unknownCreator')}</dd>
              </div>
            )}
            {item.cast && item.cast.length > 0 && (
              <div>
                <dt className="meta-label">Cast</dt>
                <dd className="meta-value">{item.cast.join(", ")}</dd>
              </div>
            )}
            {item.playStats && (
              <>
                <div>
                  <dt className="meta-label">Plays</dt>
                  <dd className="meta-value">{item.playStats.playcount}</dd>
                </div>
                <div>
                  <dt className="meta-label">Listeners</dt>
                  <dd className="meta-value">{item.playStats.listeners}</dd>
                </div>
              </>
            )}
          </dl>

          {item.tracklist && (
            <section className="detail-section" aria-labelledby="tracklist-title">
              <h3 id="tracklist-title" className="meta-label">Tracklist</h3>
              <ol className="tracklist">
                {item.tracklist.map((track, index) => (
                  <li className="track-row" key={`${track.name}-${index}`}>
                    <span className="track-number">{index + 1}</span>
                    <span className="track-name">{track.name}</span>
                    <span className="track-duration">{track.duration || "—"}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {item.type === "music" && item.musicKind === "artist" && (
            <ArtistAlbums
              externalId={item.id.replace(/^music-/, "")}
              isFavorite={isFavorite}
              onToggleFavorite={onToggleFavorite}
              onSelect={onOpenRelated}
              initialAlbums={initialAlbums}
            />
          )}

          {(item.type === "movie" || item.type === "tv") && streamingPlatforms.length > 0 && (
            <section className="detail-section" aria-labelledby="streaming-title">
              <h3 id="streaming-title" className="meta-label">Streaming</h3>
              <ul className="platform-chips">
                {streamingPlatforms.map((platform) => (
                  <li className="platform-chip" key={platform}>
                    {platform}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {item.type === "tv" && item.seasons && item.seasons.length > 0 && (
            <SeriesEpisodes key={item.id} externalId={item.id.replace(/^tv-/, "")} seasons={item.seasons} />
          )}
        </div>
        {viewingArtwork && item.posterUrl && (
          <ArtworkViewer src={item.posterUrl} title={item.title} onClose={() => setViewingArtwork(false)} />
        )}
      </div>
    </div>
  );
}
