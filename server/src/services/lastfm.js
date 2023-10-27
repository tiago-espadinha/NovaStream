import { buildId } from "./normalize.js";
import { ProviderError, upstreamFailure } from "./providerError.js";

const BASE = "https://ws.audioscrobbler.com/2.0/";

// Below this many Last.fm listeners, an album is treated as too obscure to surface.
// Raise it for a more mainstream-only list, lower it to let more niche results through.
const MIN_LISTENERS = 1000;
// How many of the raw search matches to pull full stats for for, before filtering.
// Last.fm's album.search doesn't return listener counts, so this costs one extra
// request per candidate — keep it modest.
const CANDIDATE_POOL = 20;
const RESULT_LIMIT = 12;
// artist.search also lists credits such as "Clairo, Wallows" as artists of their own.
const CREDIT_SEPARATOR = /, | & | x | (?:feat|ft)\. /i;
// A credit below this share of its solo artist's listeners is a collaboration, not a
// band whose name happens to contain a separator ("Simon & Garfunkel").
const CREDIT_LISTENER_SHARE = 0.1;

function key() {
  const k = process.env.LASTFM_API_KEY;
  if (!k)
    throw new ProviderError(
      "not_configured",
      "LASTFM_API_KEY is not set — get a free one at last.fm/api/account/create",
    );
  return k;
}

async function lastfmFetch(params) {
  const url = new URL(BASE);
  url.searchParams.set("api_key", key());
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  // Last.fm reports API errors in the JSON body (sometimes with a non-2xx status), and uses
  // error 6 for an artist, album, or track that doesn't exist.
  const data = await Promise.resolve()
    .then(() => res.json())
    .catch(() => ({}));
  if (data.error === 6) throw new ProviderError("not_found", `Last.fm error 6: ${data.message}`);
  if (data.error)
    throw new ProviderError("unavailable", `Last.fm error ${data.error}: ${data.message}`);
  if (!res.ok) throw upstreamFailure("Last.fm", res);
  return data;
}

function encodeId(artist, album) {
  return encodeURIComponent(`${artist}|||${album}`);
}

function musicId(kind, artist, title) {
  const identity = kind === "artist"
    ? `${kind}|||${artist}`
    : `${kind}|||${artist}|||${title}`;
  return buildId("music", encodeURIComponent(identity));
}

function artistName(artist) {
  if (typeof artist === "string") return artist;
  return artist?.name || artist?.["#text"] || "";
}

function extractAlbumMatches(data, source) {
  const payload = source === "tag"
    ? data.topalbums?.album ?? data.results?.topalbums?.album ?? data.albums?.album
    : data.results?.albummatches?.album ?? data.albummatches?.album;
  return toArray(payload).filter((album) => album && (album.name || album.title));
}

function extractMatches(data, path) {
  return path.split(".").reduce((value, key) => value?.[key], data);
}

function bestImage(images) {
  const order = ["mega", "extralarge", "large", "medium"];
  for (const size of order) {
    const match = images?.find((img) => img.size === size && img["#text"]);
    if (match) return match["#text"];
  }
  return null;
}

function cleanSummary(html) {
  if (!html) return "";
  // Last.fm wikis end with a "Read more on Last.fm" link back to themselves — strip it
  // along with any other markup rather than show raw HTML in the UI.
  return html
    .replace(/<a[^>]*>.*?<\/a>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+\n\s+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function wikiText(wiki) {
  return cleanSummary(wiki?.content || wiki?.summary || "");
}

async function getAlbumInfo(artist, album) {
  const data = await lastfmFetch({
    method: "album.getinfo",
    artist,
    album,
    autocorrect: 1,
  });
  return data.album || null;
}

async function getArtistInfo(artist) {
  const data = await lastfmFetch({
    method: "artist.getinfo",
    artist,
    autocorrect: 1,
  });
  return data.artist || null;
}

async function getTrackInfo(artist, track) {
  const data = await lastfmFetch({
    method: "track.getinfo",
    artist,
    track,
    autocorrect: 1,
  });
  return data.track || null;
}

function numericCount(value) {
  if (value === undefined || value === null || value === "") return null;
  const count = Number(value);
  return Number.isFinite(count) ? count : null;
}

function formattedPlayStats(listeners, plays) {
  if (listeners == null && plays == null) return undefined;
  return {
    listeners: (Number(listeners) || 0).toLocaleString(),
    playcount: (Number(plays) || 0).toLocaleString(),
  };
}

async function resolveAlbumMatches(matches, matchedTag) {
  // Dedupe (Last.fm's search frequently repeats the same artist/album pair) and look up
  // full stats for each candidate so we can filter and rank by actual popularity.
  const seen = new Set();
  const candidates = matches.filter((m) => {
    const artist = artistName(m.artist);
    const key = `${artist}::${m.name || m.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const withInfo = await Promise.all(
    candidates.map(async (m) => {
      try {
        const artist = artistName(m.artist);
        return {
          album: (await getAlbumInfo(artist, m.name || m.title)) || m,
          matchedTag: matchedTag || m.matchedTag,
        };
      } catch {
        return { album: m, matchedTag: matchedTag || m.matchedTag };
      }
    }),
  );

  return withInfo
    .filter(
      (match) => {
        if (!match?.album) return false;
        const listeners = Number(match.album.listeners);
        if (match.matchedTag && !Number.isFinite(listeners)) {
          return Number(match.album.playcount) > 0;
        }
        return listeners >= MIN_LISTENERS;
      },
    )
    .sort((a, b) => (Number(b.album.listeners) || 0) - (Number(a.album.listeners) || 0))
    .slice(0, RESULT_LIMIT)
    .map(({ album: a, matchedTag }) => {
      const artist = artistName(a.artist);
      const title = a.name || a.title;
      const albumTags = toArray(a.tags?.tag || [])
        .slice(0, 3)
        .map((tag) => typeof tag === "string" ? tag : tag.name)
        .filter(Boolean);
      const tags = matchedTag
        ? [
            matchedTag,
            ...albumTags.filter(
              (tag) => tag.toLowerCase() !== matchedTag.toLowerCase(),
            ),
          ]
        : albumTags;
      return {
        id: musicId("album", artist, title),
        title,
        type: "music",
        musicKind: "album",
        rating: Number(a.playcount), // Last.fm has no star-rating concept, only listen/play stats
        tags,
        genres: tags,
        releaseYear: null, // album.getinfo doesn't reliably include a release date
        posterUrl: bestImage(a.image) || a.image?.find?.((image) => image["#text"])?.["#text"] || null,
        artist,
      };
    });
}

// Drops a match that splits into parts when one part is another match in the same
// results and the split match has under CREDIT_LISTENER_SHARE of its listeners.
// Matches without a listener count are kept.
function withoutCombinedCredits(matches) {
  const soloListeners = new Map();
  for (const match of matches) {
    const name = match.name.toLowerCase();
    const listeners = numericCount(match.listeners);
    if (listeners !== null && !(soloListeners.get(name) >= listeners)) {
      soloListeners.set(name, listeners);
    }
  }
  return matches.filter((match) => {
    const parts = match.name.toLowerCase().split(CREDIT_SEPARATOR);
    const listeners = numericCount(match.listeners);
    if (parts.length < 2 || listeners === null) return true;
    return !parts.some((part) =>
      listeners < (soloListeners.get(part.trim()) ?? 0) * CREDIT_LISTENER_SHARE);
  });
}

async function searchArtists(query) {
  const data = await lastfmFetch({
    method: "artist.search",
    artist: query,
    limit: RESULT_LIMIT,
  });
  const matches = withoutCombinedCredits(
    toArray(extractMatches(data, "results.artistmatches.artist"))
      .filter((artist) => artist?.name),
  );
  return Promise.all(matches.map(async (match) => {
    let artist = match;
    try {
      artist = (await getArtistInfo(match.name)) || match;
    } catch {
      // Keep the search match when detail enrichment is unavailable.
    }
    const stats = artist.stats || {};
    const plays = stats.playcount ?? artist.playcount ?? match.playcount;
    const playStats = formattedPlayStats(
      stats.listeners ?? artist.listeners ?? match.listeners,
      plays,
    );
    return {
      id: musicId("artist", match.name),
      title: artist.name || match.name,
      type: "music",
      musicKind: "artist",
      rating: numericCount(plays),
      ...(playStats ? { playStats } : {}),
      tags: [],
      genres: [],
      releaseYear: null,
      posterUrl: bestImage(artist.image) || bestImage(match.image),
    };
  }));
}

async function searchAlbums(query) {
  const data = await lastfmFetch({
    method: "album.search",
    album: query,
    limit: CANDIDATE_POOL,
  });
  return resolveAlbumMatches(extractAlbumMatches(data, "search"));
}

async function searchSongs(query) {
  const data = await lastfmFetch({
    method: "track.search",
    track: query,
    limit: RESULT_LIMIT,
  });
  const matches = toArray(extractMatches(data, "results.trackmatches.track"))
    .filter((track) => track?.name);
  return Promise.all(matches.map(songFromMatch));
}

// Chart and search matches carry placeholder art and partial stats, so each one is
// enriched with track.getinfo (album cover, full play counts).
async function songFromMatch(match) {
  const requestedArtist = artistName(match.artist);
  let track = match;
  try {
    track = (await getTrackInfo(requestedArtist, match.name)) || match;
  } catch {
    // Keep the original match when detail enrichment is unavailable.
  }
  const artist = artistName(track.artist) || requestedArtist;
  const plays = track.playcount ?? match.playcount;
  const playStats = formattedPlayStats(
    track.listeners ?? match.listeners,
    plays,
  );
  return {
    id: musicId("song", requestedArtist, match.name),
    title: track.name || match.name,
    type: "music",
    musicKind: "song",
    rating: numericCount(plays),
    ...(playStats ? { playStats } : {}),
    tags: [],
    genres: [],
    releaseYear: null,
    posterUrl:
      bestImage(track.album?.image) ||
      bestImage(track.image) ||
      bestImage(match.image),
    artist,
  };
}

export async function searchMusic(query, kind = "all") {
  const searchers = {
    artist: () => searchArtists(query),
    album: () => searchAlbums(query),
    song: () => searchSongs(query),
  };
  if (kind !== "all") return searchers[kind]();
  const groups = await Promise.all(Object.values(searchers).map((search) => search()));
  return groups.flat();
}

export async function searchMusicByTag(tag, kind = "album") {
  const normalizeTag = (value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  let matchingTags = [];

  try {
    const data = await lastfmFetch({
      method: "tag.search",
      tag,
      limit: CANDIDATE_POOL,
    });
    const target = normalizeTag(tag);
    matchingTags = toArray(data.results?.tagmatches?.tag || [])
      .map((match) => match.name)
      .filter((name) => normalizeTag(name).includes(target))
      .slice(0, CANDIDATE_POOL);
  } catch {
    // Fall back to the provider's direct tag lookup if tag.search is unavailable.
  }

  if (!matchingTags.length) matchingTags = [tag];
  const kinds = kind === "all" ? ["artist", "album", "song"] : [kind];
  const groups = await Promise.all(kinds.map(async (resultKind) => {
    const matches = await Promise.all(
      matchingTags.map(async (matchedTag) => {
        try {
          const method = {
            artist: "tag.gettopartists",
            album: "tag.gettopalbums",
            song: "tag.gettoptracks",
          }[resultKind];
          const data = await lastfmFetch({
            method,
            tag: matchedTag,
            limit: Math.ceil(CANDIDATE_POOL / matchingTags.length),
          });
          if (resultKind === "album") {
            return extractAlbumMatches(data, "tag").map((album) => ({
              ...album,
              matchedTag,
            }));
          }
          const path = resultKind === "artist" ? "topartists.artist" : "toptracks.track";
          return toArray(extractMatches(data, path)).map((match) => ({
            ...match,
            matchedTag,
          }));
        } catch {
          return [];
        }
      }),
    );
    const flattened = matches.flat();
    if (resultKind === "album") return resolveAlbumMatches(flattened, tag);
    return flattened.slice(0, RESULT_LIMIT).map((match) => {
      const isArtist = resultKind === "artist";
      const artist = isArtist ? match.name : artistName(match.artist);
      const title = match.name || match.title;
      const matchedTag = [tag];
      return {
        id: musicId(resultKind, artist, title),
        title,
        type: "music",
        musicKind: resultKind,
        rating: Number(match.playcount) || 0,
        tags: matchedTag,
        genres: matchedTag,
        releaseYear: null,
        posterUrl: bestImage(match.image),
        ...(!isArtist ? { artist } : {}),
      };
    });
  }));
  return groups.flat();
}

export async function getMusicDetail(compositeId) {
  const parts = compositeId.split("|||");
  const isLegacyAlbumId = parts.length === 2 && parts[0] !== "artist";
  const kind = isLegacyAlbumId ? "album" : parts[0];
  const artist = isLegacyAlbumId ? parts[0] : parts[1];
  const title = isLegacyAlbumId ? parts[1] : parts.slice(2).join("|||");

  if (kind === "artist") {
    const result = await getArtistInfo(artist || parts.slice(1).join("|||"));
    if (!result) throw new ProviderError("not_found", "Artist not found on Last.fm");
    return artistDetail(result, compositeId);
  }
  if (!artist || !title || !["album", "song"].includes(kind)) {
    throw new ProviderError("not_found", "Malformed music id");
  }

  if (kind === "song") {
    const result = await getTrackInfo(artist, title);
    if (!result) throw new ProviderError("not_found", "Song not found on Last.fm");
    return songDetail(result, artist, title, compositeId);
  }

  const a = await getAlbumInfo(artist, title);
  if (!a) throw new ProviderError("not_found", "Album not found on Last.fm");
  const tracks = toArray(a.tracks?.track);
  const totalSeconds = tracks.reduce(
    (sum, t) => sum + (Number(t.duration) || 0),
    0,
  );
  const mins = Math.round(totalSeconds / 60);

  const listeners = Number(a.listeners) || 0;
  const playcount = Number(a.playcount) || 0;
  const stats = {
    listeners: listeners.toLocaleString(),
    playcount: playcount.toLocaleString(),
  };
  const bio = wikiText(a.wiki);
  const tracklist = tracks.map((t) => ({
    name: t.name,
    duration: t.duration
      ? `${Math.round(Number(t.duration) / 60)}:${String(Math.round(Number(t.duration) % 60)).padStart(2, "0")}`
      : null,
  }));

  return {
    id: buildId("music", encodeURIComponent(compositeId)),
    title: a.name,
    type: "music",
    musicKind: "album",
    rating: playcount,
    overview: bio || "No summary available.",
    tags: toArray(a.tags?.tag || [])
      .slice(0, 5)
      .map((t) => t.name),
    genres: toArray(a.tags?.tag || [])
      .slice(0, 5)
      .map((t) => t.name),
    releaseYear: null,
    runtime: tracks.length
      ? `${tracks.length} tracks${mins ? ` · ${mins} min` : ""}`
      : null,
    creatorLabel: "Artist",
    creator: a.artist.name || a.artist,
    // Last.fm doesn't report real streaming availability — these are search links, not a
    // verified "available here" list.
    platforms: [
      "Search on Spotify",
      "Search on Apple Music",
      "Search on YouTube Music",
    ],
    posterUrl: bestImage(a.image),
    playStats: stats,
    tracklist: tracklist,
  };
}

function artistDetail(artist, compositeId) {
  const name = artist.name || "Unknown artist";
  const stats = artist.stats || {};
  const tags = toArray(artist.tags?.tag || [])
    .slice(0, 5)
    .map((tag) => typeof tag === "string" ? tag : tag.name)
    .filter(Boolean);
  return {
    id: buildId("music", encodeURIComponent(compositeId)),
    title: name,
    type: "music",
    musicKind: "artist",
    rating: Number(stats.playcount) || 0,
    overview: wikiText(artist.bio) || "No summary available.",
    tags,
    genres: tags,
    releaseYear: null,
    runtime: null,
    creatorLabel: "Artist",
    creator: name,
    platforms: ["Search on Spotify", "Search on Apple Music", "Search on YouTube Music"],
    posterUrl: bestImage(artist.image),
    playStats: {
      listeners: (Number(stats.listeners) || 0).toLocaleString(),
      playcount: (Number(stats.playcount) || 0).toLocaleString(),
    },
  };
}

function songDetail(track, requestedArtist, requestedTitle, compositeId) {
  const artist = artistName(track.artist) || requestedArtist;
  const title = track.name || requestedTitle;
  const album = typeof track.album === "string" ? track.album : track.album?.title;
  const tags = toArray(track.toptags?.tag || [])
    .slice(0, 5)
    .map((tag) => typeof tag === "string" ? tag : tag.name)
    .filter(Boolean);
  const stats = formattedPlayStats(track.listeners, track.playcount);
  return {
    id: buildId("music", encodeURIComponent(compositeId)),
    title,
    type: "music",
    musicKind: "song",
    rating: Number(track.playcount) || 0,
    overview: wikiText(track.wiki) || (album ? `A song by ${artist} from ${album}.` : `A song by ${artist}.`),
    tags,
    genres: tags,
    releaseYear: null,
    runtime: Number(track.duration) ? `${Math.floor(Number(track.duration) / 60000)}:${String(Math.floor((Number(track.duration) % 60000) / 1000)).padStart(2, "0")}` : null,
    creatorLabel: "Artist",
    creator: artist,
    platforms: ["Search on Spotify", "Search on Apple Music", "Search on YouTube Music"],
    posterUrl: bestImage(track.album?.image || track.image),
    ...(stats ? { playStats: stats } : {}),
  };
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
