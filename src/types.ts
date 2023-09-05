export type ContentType = "movie" | "tv" | "music" | "book" | "game";
export type MusicKind = "artist" | "album" | "song";

export const MUSIC_KIND_LABELS: Record<MusicKind, string> = {
  artist: "Artist",
  album: "Album",
  song: "Song",
};

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

/** Full record for the detail screen — either a mock entry or a fetched live one. */
export interface ContentItem extends MediaSummary {
  overview: string;
  releaseYear: number | null;
  /** Human-readable length: "2h 14m", "3 seasons", "320 pages", "15–20 hrs", etc. */
  runtime: string | null;
  /** Label for `creator`, tailored per type: "Director", "Artist", "Author", "Studio". */
  creatorLabel: string;
  creator: string;
  /** Lead cast/performers — populated for movies and TV, omitted otherwise. */
  cast?: string[];
  /** Where to watch/listen/read/play/buy. */
  platforms: string[];
  playStats?: { listeners: string; playcount: string };
  tracklist?: { name: string; duration: string }[];
}

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  movie: "Movies",
  tv: "TV",
  music: "Music",
  book: "Books",
  game: "Games",
};
