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

export async function searchGames(query) {
  const data = await rawgFetch("/games", { search: query, page_size: 20 });
  return (data.results || [])
    .map(summarize)
    .filter((game) => game.rating != null && game.rating !== 0);
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
