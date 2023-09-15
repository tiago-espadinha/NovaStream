import { buildId } from "./normalize.js";
import { ProviderError, upstreamFailure } from "./providerError.js";

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

async function tmdbFetch(pathname, params = {}) {
  const url = new URL(`${BASE}${pathname}`);
  url.searchParams.set("api_key", key());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
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

export async function searchMovies(query) {
  const data = await tmdbFetch("/search/movie", {
    query,
    include_adult: "false",
  });
  return (data.results || [])
    .map((r) => summarize(r, "movie"))
    .filter((movie) => movie.rating !== null && movie.rating !== 0);
}

export async function searchTv(query) {
  const data = await tmdbFetch("/search/tv", { query, include_adult: "false" });
  return (data.results || []).map((r) =>
    summarize(r, "tv")).filter((tv) => tv.rating !== null && tv.rating !== 0);
}

export async function getMovieDetail(id) {
  const raw = await tmdbFetch(`/movie/${id}`, {
    append_to_response: "credits,watch/providers",
  });
  const director = raw.credits?.crew?.find((c) => c.job === "Director");
  const hours = Math.floor((raw.runtime || 0) / 60);
  const mins = (raw.runtime || 0) % 60;
  return {
    id: buildId("movie", raw.id),
    title: raw.title,
    type: "movie",
    rating: raw.vote_average ?? null,
    overview: raw.overview || "",
    genres: (raw.genres || []).map((g) => g.name),
    releaseYear: raw.release_date ? Number(raw.release_date.slice(0, 4)) : null,
    runtime: raw.runtime
      ? `${hours}h ${mins.toString().padStart(2, "0")}m`
      : null,
    creatorLabel: "Director",
    creator: director?.name || "Unknown",
    cast: (raw.credits?.cast || []).slice(0, 6).map((c) => c.name),
    platforms: watchProviders(raw["watch/providers"]),
    posterUrl: raw.poster_path
      ? `https://image.tmdb.org/t/p/w500${raw.poster_path}`
      : null,
  };
}

export async function getTvDetail(id) {
  const raw = await tmdbFetch(`/tv/${id}`, {
    append_to_response: "credits,watch/providers",
  });
  const creator = raw.created_by?.[0];
  return {
    id: buildId("tv", raw.id),
    title: raw.name,
    type: "tv",
    rating: raw.vote_average ?? null,
    overview: raw.overview || "",
    genres: (raw.genres || []).map((g) => g.name),
    releaseYear: raw.first_air_date
      ? Number(raw.first_air_date.slice(0, 4))
      : null,
    runtime: `${raw.number_of_seasons ?? "?"} season${raw.number_of_seasons === 1 ? "" : "s"} · ${raw.number_of_episodes ?? "?"} episodes`,
    creatorLabel: "Creator",
    creator: creator?.name || "Unknown",
    cast: (raw.credits?.cast || []).slice(0, 6).map((c) => c.name),
    platforms: watchProviders(raw["watch/providers"]),
    posterUrl: raw.poster_path
      ? `https://image.tmdb.org/t/p/w500${raw.poster_path}`
      : null,
  };
}
