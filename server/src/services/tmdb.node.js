import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { getTvDetail } from "./tmdb.js";

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
    { number: 5, name: "Season 5", episodeCount: 6 },
    { number: 0, name: "Specials", episodeCount: 3 },
  ]);
});

test("keeps a specials-only series and tolerates missing season data", async () => {
  mockTmdb({ id: 7, name: "Example Show", seasons: [{ season_number: 0, name: null }] });
  assert.deepEqual((await getTvDetail("7")).seasons, [{ number: 0, name: "Specials", episodeCount: 0 }]);

  mockTmdb({ id: 7, name: "Example Show" });
  assert.deepEqual((await getTvDetail("7")).seasons, []);
});
