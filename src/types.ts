import i18n from "./i18n";

export type ContentType = "movie" | "tv" | "music" | "book" | "game";
export type MusicKind = "artist" | "album" | "song";

/**
 * A label map whose values are looked up in the active language each time they are read, so
 * keys can be listed (`Object.keys`) while the words follow the language switcher.
 */
function localizedLabels<K extends string>(keys: readonly K[], label: (key: K) => string): Record<K, string> {
  const labels = {} as Record<K, string>;
  for (const key of keys) Object.defineProperty(labels, key, { enumerable: true, get: () => label(key) });
  return labels;
}

export const MUSIC_KIND_LABELS: Record<MusicKind, string> = localizedLabels(
  ["artist", "album", "song"],
  (kind) => i18n.t(`mediaTypes.musicKinds.${kind}`),
);

/**
 * The minimum a grid card needs to render. Search results from the live backend arrive in
 * roughly this shape before a full detail fetch. `gradientFrom`/`gradientTo` are the mock
 * dataset's placeholder-poster colors; live results carry `posterUrl` instead (see
 * `src/utils/gradient.ts` for the fallback used when neither is present).
 */
export interface MediaSummary {
  id: string;
  title: string;
  type: ContentType;
  rating: number | null;
  genres: string[];
  tags?: string[];
  releaseYear?: number | null;
  posterUrl?: string | null;
  gradientFrom?: string;
  gradientTo?: string;
  artist?: string;
  musicKind?: MusicKind;
  playStats?: {
    listeners: string;
    playcount: string;
  };
}

export type CreatorRole = 'director' | 'creator' | 'studio' | 'author' | 'artist';

/** Length of a title, tagged by what is being measured. Mirrors the server's detail payload. */
export type MediaLength =
  | { kind: 'minutes'; minutes: number }
  | { kind: 'seasons'; seasons: number | null; episodes: number | null }
  | { kind: 'playtime'; hours: number }
  | { kind: 'tracks'; tracks: number; minutes: number | null }
  | { kind: 'duration'; seconds: number }
  | { kind: 'pages'; pages: number };

/** Full record for the detail screen — either a mock entry or a fetched live one. */
export interface ContentItem extends MediaSummary {
  overview: string;
  releaseYear: number | null;
  /** How long it is, as data; the client words it (see utils/mediaLabels). Null when unknown. */
  length: MediaLength | null;
  /** What `creator` did for this type; the client turns it into a localized label. */
  creatorRole: CreatorRole;
  /** Null when the source doesn't name one; the client shows its own "unknown" text. */
  creator: string | null;
  /** Lead cast/performers — populated for movies and TV, omitted otherwise. */
  cast?: string[];
  /** Where to watch/listen/read/play/buy. */
  platforms: string[];
  playStats?: { listeners: string; playcount: string };
  tracklist?: { name: string; duration: string }[];
  /** Series only: regular seasons in order, then specials (season 0). Episodes load per season. */
  seasons?: SeasonSummary[];
}

export interface SeasonSummary {
  number: number;
  /** TMDb's season name, or null when it has none (the client labels it from the number). */
  name: string | null;
  episodeCount: number;
}

export interface Episode {
  number: number;
  /** Null when TMDb has no title (the client shows "Episode N"). */
  title: string | null;
  /** ISO date (YYYY-MM-DD), or null when TMDb hasn't announced one. */
  airDate: string | null;
}

export interface SeasonEpisodes {
  number: number;
  name: string;
  episodes: Episode[];
}

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = localizedLabels(
  ["movie", "tv", "music", "book", "game"],
  (type) => i18n.t(`mediaTypes.plural.${type}`),
);

export interface UserPreferences {
  favoriteGenres: string[];
  theme?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  preferences: UserPreferences;
  savedMedia: MediaSummary[];
  createdAt: string;
}
