import { buildId, normalizeRatingOutOf10 } from "./normalize.js";
import { ProviderError, upstreamFailure } from "./providerError.js";

const BASE = "https://api.rawg.io/api";

function key() {
  const k = process.env.RAWG_API_KEY;
  if (!k)
    throw new ProviderError(
      "not_configured",
      "RAWG_API_KEY is not set — get a free one at rawg.io/apidocs",
    );
  return k;
}

async function rawgFetch(pathname, params = {}) {
  const url = new URL(`${BASE}${pathname}`);
  url.searchParams.set("key", key());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw upstreamFailure("RAWG", res);
  return res.json();
}

function summarize(raw) {
  return {
    id: buildId("game", raw.id),
    title: raw.name,
    type: "game",
    rating: normalizeRatingOutOf10(raw.rating, 5),
    genres: (raw.genres || []).map((g) => g.name),
    tags: (raw.tags || []).map((tag) => tag.name).filter(Boolean),
    releaseYear: raw.released ? Number(raw.released.slice(0, 4)) : null,
    posterUrl: raw.background_image || null,
  };
}

function normalizeLabel(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function findTaxonomyIds(path, label) {
  const data = await rawgFetch(path, { search: label, page_size: 40 });
  const target = normalizeLabel(label);
  return (data.results || [])
    .filter((entry) =>
      normalizeLabel(entry.name || "").includes(target) || normalizeLabel(entry.slug || "").includes(target),
    )
    .map((entry) => entry.id)
    .filter(Boolean);
}

async function searchGamesByTaxonomy(label, field, path) {
  const taxonomyIds = await findTaxonomyIds(path, label);
  if (!taxonomyIds.length) return [];

  const data = await rawgFetch("/games", {
    [field]: taxonomyIds.join(","),
    page_size: 40,
    ordering: "-rating",
  });
  return (data.results || [])
    .map(summarize)
    .filter((game) => game.rating != null && game.rating !== 0);
}

export async function searchGames(query) {
  const data = await rawgFetch("/games", { search: query, page_size: 20 });
  return (data.results || [])
    .map(summarize)
    .filter((game) => game.rating != null && game.rating !== 0);
}

const TRENDING_WINDOW_DAYS = 30;

// RAWG has no trending endpoint; its docs suggest recent releases ordered by how many
// users added them, which is what the RAWG site calls "popular in the last 30 days".
export async function trendingGames() {
  const now = new Date();
  const since = new Date(now.getTime() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const day = (date) => date.toISOString().slice(0, 10);
  const data = await rawgFetch("/games", {
    dates: `${day(since)},${day(now)}`,
    ordering: "-added",
    page_size: 20,
  });
  return (data.results || [])
    .map(summarize)
    .map((game) => (game.rating === 0 ? { ...game, rating: null } : game));
}

export function searchGamesByGenre(genre) {
  return searchGamesByTaxonomy(genre, "genres", "/genres");
}

export function searchGamesByTag(tag) {
  return searchGamesByTaxonomy(tag, "tags", "/tags").then(async (results) => {
    if (results.length) return results;
    return searchGamesByTaxonomy(tag, "genres", "/genres");
  });
}

export async function getGameDetail(id) {
  const raw = await rawgFetch(`/games/${id}`);
  const creator = raw.developers?.[0]?.name || raw.publishers?.[0]?.name;
  return {
    id: buildId("game", raw.id),
    title: raw.name,
    type: "game",
    rating: normalizeRatingOutOf10(raw.rating, 5),
    overview: (raw.description_raw || "").trim(),
    genres: (raw.genres || []).map((g) => g.name),
    tags: (raw.tags || []).map((tag) => tag.name).filter(Boolean),
    releaseYear: raw.released ? Number(raw.released.slice(0, 4)) : null,
    runtime: raw.playtime ? `~${raw.playtime} hrs` : null,
    creatorLabel: "Studio",
    creator: creator || "Unknown",
    platforms: (raw.platforms || []).map((p) => p.platform.name),
    posterUrl: raw.background_image || null,
  };
}
