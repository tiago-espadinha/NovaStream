import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { getMovieDetail, getTvDetail, getTvSeason } from "./tmdb.js";

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
