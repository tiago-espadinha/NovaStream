import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { getMovieDetail, getTvDetail, getTvSeason, searchMovies, trendingTv } from "./tmdb.js";

let originalFetch;
let originalApiKey;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalApiKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = "test-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.TMDB_API_KEY;
  else process.env.TMDB_API_KEY = originalApiKey;
});

/** Answers every TMDb request with `body`, and records the requested paths. */
function mockTmdb(body) {
  // Detail requests append watch providers, which TMDb always includes in the answer.
  body = { "watch/providers": { results: {} }, ...body };
  const paths = [];
  globalThis.fetch = async (input) => {
    paths.push(new URL(input).pathname);
    return { ok: true, json: async () => body };
  };
  return paths;
}

test("lists regular seasons in order with specials last", async () => {
  mockTmdb({
    id: 7,
    name: "Example Show",
    seasons: [
      { season_number: 0, name: "Specials", episode_count: 3 },
      { season_number: 2, name: "Season 2", episode_count: 8 },
      { season_number: 1, name: "Season 1", episode_count: 10 },
      { season_number: 5, name: "", episode_count: 6 },
    ],
  });

  const detail = await getTvDetail("7");

  assert.deepEqual(detail.seasons, [
    { number: 1, name: "Season 1", episodeCount: 10 },
    { number: 2, name: "Season 2", episodeCount: 8 },
    { number: 5, name: null, episodeCount: 6 },
    { number: 0, name: "Specials", episodeCount: 3 },
  ]);
});

test("keeps a specials-only series and tolerates missing season data", async () => {
  mockTmdb({ id: 7, name: "Example Show", seasons: [{ season_number: 0, name: null }] });
  assert.deepEqual((await getTvDetail("7")).seasons, [{ number: 0, name: null, episodeCount: 0 }]);

  mockTmdb({ id: 7, name: "Example Show" });
  assert.deepEqual((await getTvDetail("7")).seasons, []);
});

test("maps a season's episodes in order, with null for missing fields", async () => {
  const paths = mockTmdb({
    name: "Season 2",
    episodes: [
      { episode_number: 2, name: "Second", air_date: "2024-01-12", overview: "Not sent", still_path: "/x.jpg" },
      { episode_number: 1, name: "", air_date: "" },
      { name: "No number" },
    ],
  });

  const season = await getTvSeason("7", 2);

  assert.deepEqual(paths, ["/3/tv/7/season/2"]);
  assert.deepEqual(season, {
    number: 2,
    name: "Season 2",
    episodes: [
      { number: 1, title: null, airDate: null },
      { number: 2, title: "Second", airDate: "2024-01-12" },
    ],
  });
});

test("gives an empty episode list when TMDb has none", async () => {
  mockTmdb({ name: null });
  assert.deepEqual(await getTvSeason("7", 0), { number: 0, name: null, episodes: [] });
});

test("sends structured length and creator role instead of English labels", async () => {
  mockTmdb({ id: 1, title: "Film", runtime: 125, credits: { crew: [{ job: "Director", name: "Ada" }] } });
  const movie = await getMovieDetail("1");
  assert.deepEqual(movie.length, { kind: "minutes", minutes: 125 });
  assert.equal(movie.creatorRole, "director");
  assert.equal(movie.creator, "Ada");

  mockTmdb({ id: 1, title: "Film", runtime: 0 });
  const unknown = await getMovieDetail("1");
  assert.equal(unknown.length, null);
  assert.equal(unknown.creator, null);

  mockTmdb({ id: 7, name: "Show", number_of_seasons: 2 });
  const tv = await getTvDetail("7");
  assert.deepEqual(tv.length, { kind: "seasons", seasons: 2, episodes: null });
  assert.equal(tv.creatorRole, "creator");
  assert.equal(tv.creator, null);
});

/** Answers each TMDb request from `reply(url)`, and records the URLs. */
function mockTmdbByUrl(reply) {
  const urls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    urls.push(url);
    return { ok: true, json: async () => ({ "watch/providers": { results: {} }, ...reply(url) }) };
  };
  return urls;
}

test("asks TMDb for the chosen language, English by default", async () => {
  const urls = mockTmdbByUrl(() => ({ results: [] }));
  await searchMovies("dune");
  await searchMovies("dune", "fr");
  await trendingTv("pt-PT");
  assert.deepEqual(
    urls.map((url) => url.searchParams.get("language")),
    ["en-US", "fr-FR", "pt-PT"],
  );
  const detailUrls = mockTmdbByUrl(() => ({ id: 1, overview: "ok" }));
  await getTvSeason("7", 1, "es");
  await getMovieDetail("1", "es");
  assert.deepEqual(
    detailUrls.map((url) => url.searchParams.get("language")),
    ["es-ES", "es-ES"],
  );
});

test("keeps detail genres in English when TMDb returns localized names", async () => {
  mockTmdbByUrl(() => ({
    id: 1,
    overview: "Un film",
    genres: [{ id: 878, name: "Science-Fiction" }, { id: 18, name: "Drame" }, { id: 99999, name: "Inconnu" }],
  }));
  assert.deepEqual((await getMovieDetail("1", "fr")).genres, ["Science Fiction", "Drama", "Inconnu"]);
  assert.deepEqual((await getTvDetail("1", "fr")).genres, ["Science Fiction", "Drama", "Inconnu"]);
});

test("falls back to the English overview when the translation is empty", async () => {
  for (const empty of ["", null, "   ", undefined]) {
    const urls = mockTmdbByUrl((url) =>
      url.searchParams.get("language") === "en-US"
        ? { overview: "English text" }
        : { id: 1, overview: empty },
    );
    const movie = await getMovieDetail("1", "fr");
    assert.equal(movie.overview, "English text", JSON.stringify(empty));
    assert.equal(urls.length, 2);
    assert.equal(urls[1].pathname, "/3/movie/1");
    assert.equal(urls[1].searchParams.has("append_to_response"), false);

    assert.equal((await getTvDetail("1", "es")).overview, "English text");
  }
});

test("does not fetch the fallback when the overview is present or the language is English", async () => {
  let urls = mockTmdbByUrl(() => ({ id: 1, overview: "Un résumé" }));
  assert.equal((await getMovieDetail("1", "fr")).overview, "Un résumé");
  assert.equal(urls.length, 1);

  urls = mockTmdbByUrl(() => ({ id: 1, overview: "" }));
  assert.equal((await getTvDetail("1")).overview, "");
  assert.equal(urls.length, 1);
});

test("keeps an empty overview when the English fallback fails", async () => {
  globalThis.fetch = async (input) => {
    if (new URL(input).searchParams.get("language") === "en-US") throw new Error("network down");
    return { ok: true, json: async () => ({ id: 1, overview: "", "watch/providers": { results: {} } }) };
  };
  assert.equal((await getMovieDetail("1", "fr")).overview, "");
  assert.equal((await getTvDetail("1", "fr")).overview, "");
});
