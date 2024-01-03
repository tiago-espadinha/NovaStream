import { buildId } from "./normalize.js";
import { ProviderError, upstreamFailure } from "./providerError.js";
import { TMDB_LANGUAGES } from "../utils/lang.js";

const BASE = "https://api.themoviedb.org/3";
const WATCH_REGION = "US"; // TMDb providers are region-specific; swap or make configurable later.
const GENRE_NAMES = {
  12: "Adventure",
  14: "Fantasy",
  16: "Animation",
  18: "Drama",
  27: "Horror",
  28: "Action",
  35: "Comedy",
  36: "History",
  37: "Western",
  53: "Thriller",
  80: "Crime",
  99: "Documentary",
  878: "Science Fiction",
  9648: "Mystery",
  10402: "Music",
  10749: "Romance",
  10751: "Family",
  10752: "War",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
  10770: "TV Movie",
};

function key() {
  const k = process.env.TMDB_API_KEY;
  if (!k)
    throw new ProviderError(
      "not_configured",
      "TMDB_API_KEY is not set — get a free one at themoviedb.org",
    );
  return k;
}

async function tmdbFetch(pathname, params = {}, lang = "en") {
  const url = new URL(`${BASE}${pathname}`);
  url.searchParams.set("api_key", key());
  for (const [k, v] of Object.entries({ language: TMDB_LANGUAGES[lang], ...params })) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url);
  if (!res.ok) throw upstreamFailure("TMDb", res);
  return res.json();
}

function summarize(raw, type) {
  const title = type === "movie" ? raw.title : raw.name;
  const releaseDate = type === "movie" ? raw.release_date : raw.first_air_date;
  return {
    id: buildId(type, raw.id),
    title,
    type,
    rating: raw.vote_average ?? null,
    genres: (raw.genre_ids || raw.genres || [])
      .map((g) => (typeof g === "number" ? GENRE_NAMES[g] : g.name))
      .filter((g) => typeof g === "string"),
    releaseYear: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    posterUrl: raw.poster_path
      ? `https://image.tmdb.org/t/p/w500${raw.poster_path}`
      : null,
  };
}

function watchProviders(data) {
  const region = data.results?.[WATCH_REGION];
  if (!region) return [];
  const groups = [
    ["flatrate", "Streaming on"],
    ["rent", "Rent on"],
    ["buy", "Buy on"],
  ];
  const out = [];
  for (const [key, label] of groups) {
    for (const p of region[key] || []) out.push(`${label} ${p.provider_name}`);
  }
  return out;
}

export async function searchMovies(query, lang = "en") {
  const data = await tmdbFetch("/search/movie", {
    query,
    include_adult: "false",
  }, lang);
  return (data.results || [])
    .map((r) => summarize(r, "movie"))
    .filter((movie) => movie.rating !== null && movie.rating !== 0);
}

export async function searchTv(query, lang = "en") {
  const data = await tmdbFetch("/search/tv", { query, include_adult: "false" }, lang);
  return (data.results || []).map((r) =>
    summarize(r, "tv")).filter((tv) => tv.rating !== null && tv.rating !== 0);
}

// New releases often trend before anyone has rated them; show "no rating" rather than 0.
async function trending(type, lang) {
  const data = await tmdbFetch(`/trending/${type}/week`, {}, lang);
  return (data.results || [])
    .map((result) => summarize(result, type))
    .map((item) => (item.rating === 0 ? { ...item, rating: null } : item));
}

export function trendingMovies(lang = "en") {
  return trending("movie", lang);
}

export function trendingTv(lang = "en") {
  return trending("tv", lang);
}

function normalizeLabel(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\bsci fi\b/g, "science fiction").trim();
}

function findGenreIds(genre) {
  const target = normalizeLabel(genre);
  return Object.entries(GENRE_NAMES)
    .filter(([, name]) => normalizeLabel(name).includes(target))
    .map(([id]) => id);
}

async function discover(type, params, lang) {
  const data = await tmdbFetch(`/discover/${type}`, {
    ...params,
    sort_by: "popularity.desc",
    include_adult: "false",
  }, lang);
  return (data.results || [])
    .map((result) => summarize(result, type))
    .filter((item) => item.rating !== null && item.rating !== 0);
}

async function discoverByGenre(type, genre, lang) {
  const genreIds = findGenreIds(genre);
  if (!genreIds.length) return [];
  return discover(type, { with_genres: genreIds.join("|") }, lang);
}

async function discoverByKeyword(type, tag, lang) {
  const data = await tmdbFetch("/search/keyword", { query: tag }, lang);
  const target = normalizeLabel(tag);
  const keywords = (data.results || []).filter(
    (keyword) => normalizeLabel(keyword.name).includes(target),
  );
  const resultSets = await Promise.all(
    keywords.slice(0, 3).map((keyword) => discover(type, { with_keywords: String(keyword.id) }, lang)),
  );
  const uniqueResults = new Map();
  for (const item of resultSets.flat()) uniqueResults.set(item.id, item);
  return [...uniqueResults.values()];
}

export function searchMoviesByGenre(genre, lang = "en") {
  return discoverByGenre("movie", genre, lang);
}

export function searchTvByGenre(genre, lang = "en") {
  return discoverByGenre("tv", genre, lang);
}

export function searchMoviesByTag(tag, lang = "en") {
  return discoverByKeyword("movie", tag, lang);
}

export function searchTvByTag(tag, lang = "en") {
  return discoverByKeyword("tv", tag, lang);
}

// TMDb lists specials (season 0) first; regular seasons read better ahead of them.
function seasonList(seasons) {
  return (seasons || [])
    .filter((season) => Number.isInteger(season?.season_number) && season.season_number >= 0)
    .map((season) => ({
      number: season.season_number,
      // Null when TMDb has none; the client renders "Specials" or "Season N".
      name: season.name || null,
      episodeCount: season.episode_count ?? 0,
    }))
    .sort((a, b) => (a.number === 0) - (b.number === 0) || a.number - b.number);
}

// TMDb has no overview in some languages; the English one beats an empty box.
async function overviewOf(raw, path, lang) {
  if (raw.overview?.trim() || lang === "en") return raw.overview || "";
  try {
    const english = await tmdbFetch(path, {}, "en");
    return english.overview || "";
  } catch {
    return "";
  }
}

// Detail genres stay English: the client's `genre:` search matches on those names.
const englishGenres = (genres) => (genres || []).map((g) => GENRE_NAMES[g.id] ?? g.name);

export async function getMovieDetail(id, lang = "en") {
  const raw = await tmdbFetch(`/movie/${id}`, {
    append_to_response: "credits,watch/providers",
  }, lang);
  const director = raw.credits?.crew?.find((c) => c.job === "Director");
  return {
    id: buildId("movie", raw.id),
    title: raw.title,
    type: "movie",
    rating: raw.vote_average ?? null,
    overview: await overviewOf(raw, `/movie/${id}`, lang),
    genres: englishGenres(raw.genres),
    releaseYear: raw.release_date ? Number(raw.release_date.slice(0, 4)) : null,
    length: raw.runtime > 0 ? { kind: "minutes", minutes: raw.runtime } : null,
    creatorRole: "director",
    creator: director?.name || null,
    cast: (raw.credits?.cast || []).slice(0, 6).map((c) => c.name),
    platforms: watchProviders(raw["watch/providers"]),
    posterUrl: raw.poster_path
      ? `https://image.tmdb.org/t/p/w500${raw.poster_path}`
      : null,
  };
}

export async function getTvDetail(id, lang = "en") {
  const raw = await tmdbFetch(`/tv/${id}`, {
    append_to_response: "credits,watch/providers",
  }, lang);
  const creator = raw.created_by?.[0];
  return {
    id: buildId("tv", raw.id),
    title: raw.name,
    type: "tv",
    rating: raw.vote_average ?? null,
    overview: await overviewOf(raw, `/tv/${id}`, lang),
    genres: englishGenres(raw.genres),
    releaseYear: raw.first_air_date
      ? Number(raw.first_air_date.slice(0, 4))
      : null,
    length: {
      kind: "seasons",
      seasons: raw.number_of_seasons ?? null,
      episodes: raw.number_of_episodes ?? null,
    },
    creatorRole: "creator",
    creator: creator?.name || null,
    cast: (raw.credits?.cast || []).slice(0, 6).map((c) => c.name),
    platforms: watchProviders(raw["watch/providers"]),
    posterUrl: raw.poster_path
      ? `https://image.tmdb.org/t/p/w500${raw.poster_path}`
      : null,
    seasons: seasonList(raw.seasons),
  };
}

export async function getTvSeason(id, season, lang = "en") {
  const raw = await tmdbFetch(`/tv/${id}/season/${season}`, {}, lang);
  return {
    number: season,
    name: raw.name || null,
    episodes: (raw.episodes || [])
      .filter((episode) => Number.isInteger(episode?.episode_number))
      .map((episode) => ({
        number: episode.episode_number,
        title: episode.name || null,
        airDate: episode.air_date || null,
      }))
      .sort((a, b) => a.number - b.number),
  };
}
