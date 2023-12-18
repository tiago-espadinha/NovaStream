import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { getArtistTopAlbums, getMusicDetail, searchMusic, searchMusicByTag } from "./lastfm.js";

let originalFetch;
let originalApiKey;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalApiKey = process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY = "test";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.LASTFM_API_KEY;
  else process.env.LASTFM_API_KEY = originalApiKey;
});

function mockLastfm(responses, failedMethods = []) {
  const calls = [];
  globalThis.fetch = async (input) => {
    const method = new URL(input).searchParams.get("method");
    calls.push(method);
    if (failedMethods.includes(method)) {
      return { ok: false, status: 503, statusText: "Unavailable" };
    }
    return { ok: true, json: async () => responses[method] ?? {} };
  };
  return calls;
}

test("searches and opens artist, album, and song results", async () => {
  const calls = mockLastfm({
    "artist.search": {
      results: { artistmatches: { artist: { name: "The Example", playcount: "7000", image: [] } } },
    },
    "album.search": {
      results: { albummatches: { album: { name: "First Record", artist: "The Example" } } },
    },
    "album.getinfo": {
      album: {
        name: "First Record",
        artist: { name: "The Example" },
        listeners: "2000",
        playcount: "9000",
        image: [],
        tracks: { track: [] },
      },
    },
    "track.search": {
      results: { trackmatches: { track: { name: "Opening Song", artist: "The Example", playcount: "4000", image: [] } } },
    },
    "artist.getinfo": {
      artist: {
        name: "The Example",
        stats: { listeners: "3000", playcount: "7000" },
        image: [{ size: "extralarge", "#text": "https://example.com/artist.jpg" }],
      },
    },
    "track.getinfo": {
      track: {
        name: "Opening Song",
        artist: "The Example",
        listeners: "500",
        playcount: "4000",
        duration: "187000",
        album: {
          title: "First Record",
          image: [{ size: "extralarge", "#text": "https://example.com/song.jpg" }],
        },
      },
    },
  });

  const results = await searchMusic("Example");
  assert.deepEqual(results.map((item) => item.musicKind), ["artist", "album", "song"]);
  assert.equal(results[0].rating, 7000);
  assert.equal(results[0].posterUrl, "https://example.com/artist.jpg");
  assert.equal(results[2].rating, 4000);
  assert.equal(results[2].posterUrl, "https://example.com/song.jpg");
  assert.equal(results[2].artist, "The Example");

  for (const result of results) {
    const externalId = decodeURIComponent(result.id.slice("music-".length));
    const detail = await getMusicDetail(externalId);
    assert.equal(detail.musicKind, result.musicKind);
    assert.equal(detail.id, result.id);
    if (result.musicKind !== "album") {
      assert.equal(detail.rating, result.rating);
      assert.equal(detail.posterUrl, result.posterUrl);
    }
  }

  for (const method of ["artist.search", "album.search", "track.search", "artist.getinfo", "album.getinfo", "track.getinfo"]) {
    assert.ok(calls.includes(method), method);
  }
});

test("preserves the requested tag when album enrichment is unavailable", async () => {
  const calls = mockLastfm({
    "tag.search": { results: { tagmatches: { tag: { name: "indie rock" } } } },
    "tag.gettopalbums": {
      topalbums: { album: { name: "Deep Tracks", artist: { name: "The Example" }, playcount: "90000", image: [] } },
    },
  }, ["album.getinfo"]);

  const results = await searchMusicByTag("indie");
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Deep Tracks");
  assert.equal(results[0].musicKind, "album");
  assert.deepEqual(results[0].tags, ["indie"]);
  assert.deepEqual(calls, ["tag.search", "tag.gettopalbums", "album.getinfo"]);
});

test("returns distinct entity kinds for a mixed tag search", async () => {
  mockLastfm({
    "tag.search": { results: { tagmatches: { tag: { name: "indie rock" } } } },
    "tag.gettopartists": { topartists: { artist: { name: "The Example", playcount: "90000", image: [] } } },
    "tag.gettopalbums": { topalbums: { album: { name: "Deep Tracks", artist: "The Example", playcount: "90000", image: [] } } },
    "tag.gettoptracks": { toptracks: { track: { name: "One Song", artist: "The Example", playcount: "90000", image: [] } } },
    "album.getinfo": {
      album: { name: "Deep Tracks", artist: { name: "The Example" }, listeners: "2000", playcount: "90000", image: [] },
    },
  });

  const results = await searchMusicByTag("indie", "all");
  assert.deepEqual(results.map((item) => item.musicKind), ["artist", "album", "song"]);
  assert.ok(results.every((item) => item.tags.includes("indie")));
});
test("reports a Last.fm error 6 as not_found so the client doesn't offer a retry", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    statusText: "Bad Request",
    json: async () => ({ error: 6, message: "The artist you supplied could not be found" }),
  });
  await assert.rejects(getMusicDetail("artist|||Nobody At All"), { name: "ProviderError", code: "not_found" });
});

function artistSearch(artists) {
  return {
    "artist.search": {
      results: { artistmatches: { artist: artists.map(([name, listeners]) => ({ name, listeners, image: [] })) } },
    },
  };
}

async function artistTitles(query) {
  return (await searchMusic(query, "artist")).map((item) => item.title);
}

test("hides combined credits that share a name with a much bigger solo artist", async () => {
  const calls = mockLastfm(artistSearch([
    ["Clairo", "2000000"],
    ["Clairo, beabadoobee", "40000"],
    ["Clairo, Wallows", "15000"],
    ["Clairo & Friends", "1000"],
    ["CLAIRO x Someone", "900"],
    ["Someone feat. Clairo", "800"],
    ["Other ft. clairo", "700"],
  ]));

  assert.deepEqual(await artistTitles("clairo"), ["Clairo"]);
  assert.equal(calls.filter((method) => method === "artist.getinfo").length, 1);
});

test("keeps real artist names that contain separators", async () => {
  mockLastfm(artistSearch([
    ["Simon & Garfunkel", "3000000"],
    ["Earth, Wind & Fire", "2500000"],
    ["Crosby, Stills, Nash & Young", "900000"],
    ["Earth", "200000"],
    ["Stills", "50000"],
  ]));

  assert.deepEqual(await artistTitles("and"), [
    "Simon & Garfunkel",
    "Earth, Wind & Fire",
    "Crosby, Stills, Nash & Young",
    "Earth",
    "Stills",
  ]);
});

test("keeps a credit at exactly the listener share and drops one just below it", async () => {
  mockLastfm(artistSearch([
    ["Solo", "1000"],
    ["Solo, Exactly", "100"],
    ["Solo, Below", "99"],
    ["Solo & Unknown", undefined],
    ["Solo & Empty", ""],
  ]));

  assert.deepEqual(await artistTitles("solo"), ["Solo", "Solo, Exactly", "Solo & Unknown", "Solo & Empty"]);
});

test("leaves album and song results with combined artist names alone", async () => {
  mockLastfm({
    ...artistSearch([["Clairo", "2000000"]]),
    "album.search": {
      results: { albummatches: { album: { name: "Shared Record", artist: "Clairo, Wallows" } } },
    },
    "album.getinfo": {
      album: { name: "Shared Record", artist: "Clairo, Wallows", listeners: "5000", playcount: "9000", image: [] },
    },
    "track.search": {
      results: { trackmatches: { track: { name: "Shared Song", artist: "Clairo, Wallows", listeners: "10", image: [] } } },
    },
  });

  const results = await searchMusic("clairo");
  assert.deepEqual(
    results.map((item) => [item.musicKind, item.title, item.artist]),
    [
      ["artist", "Clairo", undefined],
      ["album", "Shared Record", "Clairo, Wallows"],
      ["song", "Shared Song", "Clairo, Wallows"],
    ],
  );
});

function topAlbums(albums) {
  return { "artist.gettopalbums": { topalbums: { album: albums } } };
}

test("lists an artist's top albums by plays, without nulls, blanks or repeats, up to 12", async () => {
  const fillers = Array.from({ length: 8 }, (_, i) => ({ name: `Filler ${i + 1}`, playcount: String(201 + i) }));
  mockLastfm(topAlbums([
    { name: "(null)", playcount: "999999" },
    { name: "", playcount: "5" },
    { name: "   ", playcount: "5" },
    { name: "Small", playcount: "9" },
    { name: "Medium", playcount: "100" },
    { name: "dup", playcount: "400" },
    { name: "Dup", playcount: "500" },
    { name: "No Count" },
    ...fillers,
    { name: "Late Hit", playcount: "50000" },
  ]));

  const albums = await getArtistTopAlbums("artist|||The Example");
  assert.deepEqual(albums.map((album) => album.title), [
    "Late Hit",
    "Dup",
    ...fillers.map((album) => album.name).reverse(),
    "Medium",
    "Small",
  ]);
});

test("maps a top album to a card that opens that album's detail", async () => {
  mockLastfm(topAlbums({
    name: "First Record",
    playcount: "9000",
    artist: { name: "The Example" },
    image: [{ size: "extralarge", "#text": "https://example.com/first.jpg" }],
  }));

  assert.deepEqual(await getArtistTopAlbums("artist|||the example"), [{
    id: `music-${encodeURIComponent("album|||The Example|||First Record")}`,
    title: "First Record",
    type: "music",
    musicKind: "album",
    rating: 9000,
    tags: [],
    genres: [],
    releaseYear: null,
    posterUrl: "https://example.com/first.jpg",
    artist: "The Example",
  }]);
});

test("asks Last.fm for the artist by name, separators and all", async () => {
  const artists = [];
  globalThis.fetch = async (input) => {
    artists.push(new URL(input).searchParams.get("artist"));
    return { ok: true, json: async () => ({}) };
  };

  assert.deepEqual(await getArtistTopAlbums("artist|||Simon & Garfunkel"), []);
  assert.deepEqual(artists, ["Simon & Garfunkel"]);
});

test("rejects ids that aren't an artist without calling Last.fm", async () => {
  const calls = mockLastfm({});
  for (const id of ["album|||The Example|||First Record", "artist|||  ", "The Example"]) {
    await assert.rejects(getArtistTopAlbums(id), { name: "ProviderError", code: "not_found" });
  }
  assert.deepEqual(calls, []);
});

test("reports a failed top-albums lookup as unavailable", async () => {
  mockLastfm({}, ["artist.gettopalbums"]);
  await assert.rejects(getArtistTopAlbums("artist|||The Example"), { name: "ProviderError", code: "unavailable" });
});
