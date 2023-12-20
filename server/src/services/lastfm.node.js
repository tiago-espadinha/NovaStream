import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createDeezerClient, deezer as defaultDeezer } from "./deezer.js";
import {
  getArtistTopAlbums,
  getMusicDetail,
  searchMusic,
  searchMusicByTag,
  setDeezerClient,
  trendingMusic,
} from "./lastfm.js";

const PLACEHOLDER = "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png";
const DEEZER_PICTURE = "https://cdn-images.dzcdn.net/images/artist/abc/1000x1000-000000-80-0-0.jpg";

let originalFetch;
let originalApiKey;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalApiKey = process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY = "test";
  // Deezer finds nothing unless a test says otherwise, and never reaches the network.
  mockDeezer({});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setDeezerClient(defaultDeezer);
  if (originalApiKey === undefined) delete process.env.LASTFM_API_KEY;
  else process.env.LASTFM_API_KEY = originalApiKey;
});

// Answers Deezer requests by path ("/search/artist", "/album/7", ...) with a fresh cache.
function mockDeezer(routes, options = {}) {
  const calls = [];
  setDeezerClient(createDeezerClient({
    ...options,
    fetch: async (input) => {
      const url = new URL(input);
      const { pathname } = url;
      calls.push(pathname);
      const route = routes[pathname];
      if (typeof route === "function") return route(url);
      return { ok: true, json: async () => route ?? { data: [] } };
    },
  }));
  return calls;
}

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

test("merges artist variants that differ only in case, accents or punctuation", async () => {
  const calls = mockLastfm(artistSearch([
    ["Beyonce", "40000"],
    ["Guns N' Roses", "3000000"],
    ["Beyoncé", "5000000"],
    ["guns n roses", "20000"],
    ["BEYONCE", undefined],
  ]));

  assert.deepEqual(await artistTitles("variants"), ["Beyoncé", "Guns N' Roses"]);
  assert.equal(calls.filter((method) => method === "artist.getinfo").length, 2);
});

test("keeps the first artist variant when listener counts tie", async () => {
  mockLastfm(artistSearch([["Beyonce", "100"], ["Beyoncé", "100"]]));

  assert.deepEqual(await artistTitles("beyonce"), ["Beyonce"]);
});

test("keeps artists whose names still differ after normalising", async () => {
  mockLastfm(artistSearch([
    ["Radiohead", "6000000"],
    ["Radiohead • Lossless", "3000"],
    ["!!!", "400000"],
    ["???", "1000"],
  ]));

  assert.deepEqual(await artistTitles("radiohead"), ["Radiohead", "Radiohead • Lossless", "!!!", "???"]);
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

test("gives an album on the artist's shelf its Deezer release year", async () => {
  mockLastfm(topAlbums({ name: "Discovery", playcount: "9000", artist: { name: "Daft Punk" } }));
  mockDeezer({
    "/search/album": { data: [{ id: 302127, title: "Discovery", artist: { name: "Daft Punk" } }] },
    "/album/302127": { release_date: "2001-03-07" },
  });

  const [album] = await getArtistTopAlbums("artist|||Daft Punk");
  assert.equal(album.releaseYear, 2001);
});

test("replaces Last.fm's placeholder artist image with the Deezer photo, in results and detail", async () => {
  mockLastfm({
    ...artistSearch([["Daft Punk", "4000000"]]),
    "artist.getinfo": {
      artist: { name: "Daft Punk", stats: {}, image: [{ size: "extralarge", "#text": PLACEHOLDER }] },
    },
  });
  mockDeezer({ "/search/artist": { data: [{ name: "Daft Punk", picture_xl: DEEZER_PICTURE }] } });

  const [result] = await searchMusic("daft punk", "artist");
  assert.equal(result.posterUrl, DEEZER_PICTURE);
  assert.equal(result.releaseYear, null);
  const detail = await getMusicDetail("artist|||Daft Punk");
  assert.equal(detail.posterUrl, DEEZER_PICTURE);
});

test("keeps a real Last.fm artist image without asking Deezer", async () => {
  mockLastfm({
    ...artistSearch([["The Example", "3000"]]),
    "artist.getinfo": {
      artist: { name: "The Example", image: [{ size: "extralarge", "#text": "https://example.com/artist.jpg" }] },
    },
  });
  const deezerCalls = mockDeezer({ "/search/artist": { data: [{ name: "The Example", picture_xl: DEEZER_PICTURE }] } });

  const [result] = await searchMusic("example", "artist");
  assert.equal(result.posterUrl, "https://example.com/artist.jpg");
  assert.deepEqual(deezerCalls, []);
});

test("doesn't use the photo of an artist whose name only resembles the result", async () => {
  mockLastfm({
    ...artistSearch([["Prince", "3000000"]]),
    "artist.getinfo": { artist: { name: "Prince", image: [{ size: "extralarge", "#text": PLACEHOLDER }] } },
  });
  mockDeezer({ "/search/artist": { data: [{ name: "Prince Royce", picture_xl: DEEZER_PICTURE }] } });

  const [result] = await searchMusic("prince", "artist");
  assert.equal(result.posterUrl, PLACEHOLDER);
});

test("gives song and album results and details their Deezer release year", async () => {
  mockLastfm({
    "album.search": { results: { albummatches: { album: { name: "OK Computer", artist: "Radiohead" } } } },
    "album.getinfo": {
      album: { name: "OK Computer", artist: { name: "Radiohead" }, listeners: "2000", playcount: "9000", image: [] },
    },
    "track.search": { results: { trackmatches: { track: { name: "Karma Police", artist: "Radiohead" } } } },
    "track.getinfo": { track: { name: "Karma Police", artist: { name: "Radiohead" } } },
  });
  mockDeezer({
    "/search/album": { data: [{ id: 1, title: "OK Computer", artist: { name: "Radiohead" } }] },
    "/album/1": { release_date: "1997-06-17" },
    "/search": { data: [{ id: 2, title: "Karma Police", artist: { name: "Radiohead" }, album: { id: 1 } }] },
  });

  const results = await searchMusic("radiohead");
  assert.deepEqual(results.map((item) => [item.musicKind, item.releaseYear]), [["album", 1997], ["song", 1997]]);
  assert.equal((await getMusicDetail("album|||Radiohead|||OK Computer")).releaseYear, 1997);
  assert.equal((await getMusicDetail("song|||Radiohead|||Karma Police")).releaseYear, 1997);
});

test("fills years on tag search and trending songs too", async () => {
  mockLastfm({
    "tag.search": { results: { tagmatches: { tag: { name: "indie" } } } },
    "tag.gettoptracks": { toptracks: { track: { name: "Karma Police", artist: { name: "Radiohead" } } } },
    "chart.gettoptracks": { tracks: { track: { name: "Karma Police", artist: { name: "Radiohead" } } } },
  });
  mockDeezer({
    "/search": { data: [{ id: 2, title: "Karma Police", artist: { name: "Radiohead" }, album: { id: 1 } }] },
    "/album/1": { release_date: "1997-06-17" },
  });

  assert.equal((await searchMusicByTag("indie", "song"))[0].releaseYear, 1997);
  assert.equal((await trendingMusic())[0].releaseYear, 1997);
});

test("a Deezer that is down or never answers leaves music search as it was, within the timeout", async () => {
  mockLastfm({
    ...artistSearch([["Daft Punk", "4000000"]]),
    "track.search": { results: { trackmatches: { track: { name: "One More Time", artist: "Daft Punk" } } } },
  });
  const expected = [
    ["artist", "Daft Punk", null, null],
    ["song", "One More Time", null, null],
  ];
  const summary = (results) => results.map((item) => [item.musicKind, item.title, item.releaseYear, item.posterUrl]);

  mockDeezer({
    "/search/artist": () => ({ ok: false, status: 503, json: async () => ({}) }),
    "/search": () => ({ ok: true, json: async () => ({ error: { code: 4, message: "Quota limit exceeded" } }) }),
  });
  assert.deepEqual(summary(await searchMusic("daft punk")), expected);

  mockDeezer({ "/search/artist": () => new Promise(() => {}), "/search": () => new Promise(() => {}) }, { timeoutMs: 50 });
  const started = Date.now();
  assert.deepEqual(summary(await searchMusic("daft punk")), expected);
  assert.ok(Date.now() - started < 500, "a hanging Deezer must not hold up the search past its timeout");
});

// A cold "all" search shaped like a live "Daft Punk" one: 1 artist, 12 albums (one Deezer
// doesn't know) and 12 songs (one Deezer doesn't know), the songs all on album cards.
// Fetching each card's album or track separately would take 1 + 12 + 11 + 12 + 11 = 47
// requests; sharing album fetches takes 1 + 12 + 11 + 12 = 36.
const DEEZER_ALBUMS = {
  Discovery: [1, "2001"], Homework: [2, "1997"], "Random Access Memories": [3, "2013"],
  "Human After All": [4, "2005"], "TRON: Legacy": [5, "2010"], "Alive 2007": [6, "2007"],
  "Daft Club": [7, "2003"], "Random Access Memories (10th Anniversary Edition)": [8, "2023"],
  "Musique Vol 1": [9, "2006"], "TRON: Legacy Reconfigured": [10, "2011"], "Alive 1997": [11, "2001"],
};
const LASTFM_ONLY_ALBUM = "Get Lucky";
const SONG_ALBUMS = {
  "Da Funk": "Homework", Aerodynamic: "Discovery", Voyager: "Discovery", Crescendolls: "Discovery",
  Technologic: "Human After All", Superheroes: "Discovery", Nightvision: "Discovery",
  "Digital Love": "Discovery", "Veridis Quo": "Discovery", Within: "Random Access Memories",
  Contact: "Random Access Memories",
};
const LASTFM_ONLY_SONG = "Rollin' & Scratchin' (Live Bootleg)";

function mockDaftPunkLastfm() {
  globalThis.fetch = async (input) => {
    const params = new URL(input).searchParams;
    const body = {
      "artist.search": { results: { artistmatches: { artist: { name: "Daft Punk", listeners: "4000000", image: [] } } } },
      "album.search": {
        results: {
          albummatches: {
            album: [...Object.keys(DEEZER_ALBUMS), LASTFM_ONLY_ALBUM].map((name) => ({ name, artist: "Daft Punk" })),
          },
        },
      },
      "album.getinfo": { album: { name: params.get("album"), artist: "Daft Punk", listeners: "5000", playcount: "9000", image: [] } },
      "track.search": {
        results: {
          trackmatches: {
            track: [...Object.keys(SONG_ALBUMS), LASTFM_ONLY_SONG].map((name) => ({ name, artist: "Daft Punk" })),
          },
        },
      },
    }[params.get("method")];
    return { ok: true, json: async () => body ?? {} };
  };
}

function daftPunkDeezerRoutes() {
  const titleFrom = (url) => url.searchParams.get("q").replace(/^Daft Punk /, "");
  const json = (body) => ({ ok: true, json: async () => body });
  const routes = {
    "/search/artist": { data: [{ name: "Daft Punk", picture_xl: DEEZER_PICTURE }] },
    "/search/album": (url) => {
      const album = DEEZER_ALBUMS[titleFrom(url)];
      return json({ data: album ? [{ id: album[0], title: titleFrom(url), artist: { name: "Daft Punk" } }] : [] });
    },
    "/search": (url) => {
      const album = DEEZER_ALBUMS[SONG_ALBUMS[titleFrom(url)]];
      return json({ data: album ? [{ id: 99, title: titleFrom(url), artist: { name: "Daft Punk" }, album: { id: album[0] } }] : [] });
    },
  };
  for (const [id, year] of Object.values(DEEZER_ALBUMS)) routes[`/album/${id}`] = { release_date: `${year}-01-01` };
  return routes;
}

function expectedYear(item) {
  const album = item.musicKind === "song" ? SONG_ALBUMS[item.title] : item.title;
  return DEEZER_ALBUMS[album] ? Number(DEEZER_ALBUMS[album][1]) : null;
}

test("a cold all-kinds search stays within Deezer's budget and gives every matched card its year", async () => {
  mockDaftPunkLastfm();
  const calls = mockDeezer(daftPunkDeezerRoutes(), { now: () => 0 });

  const results = await searchMusic("daft punk");

  assert.equal(calls.length, 36);
  assert.equal(results.length, 25);
  assert.equal(results[0].posterUrl, DEEZER_PICTURE);
  for (const item of results.slice(1)) assert.equal(item.releaseYear, expectedYear(item), item.title);
  const albumFetches = calls.filter((path) => path.startsWith("/album/"));
  assert.equal(new Set(albumFetches).size, albumFetches.length, "each album is fetched once");
});

test("cards whose lookups don't fit the budget keep their Last.fm output, and get years on later searches", async () => {
  mockDaftPunkLastfm();
  mockDeezer({});
  const lastfmOnly = await searchMusic("daft punk");

  let clock = 0;
  const calls = mockDeezer(daftPunkDeezerRoutes(), { now: () => clock, requestBudget: 20 });
  const first = await searchMusic("daft punk");

  assert.equal(calls.length, 20);
  assert.deepEqual(first.map((item) => item.id), lastfmOnly.map((item) => item.id));
  const skipped = first.filter((item) => item.musicKind !== "artist" && item.releaseYear !== expectedYear(item));
  assert.ok(skipped.length > 0, "the small budget should leave some cards without a year");
  for (const item of skipped) assert.deepEqual(item, lastfmOnly.find((card) => card.id === item.id));

  // Skipped lookups aren't remembered, so each later search fills in the next 20 requests' worth.
  let later;
  for (let window = 1; window <= 3; window += 1) {
    clock = window * 5000;
    later = await searchMusic("daft punk");
  }
  for (const item of later.slice(1)) assert.equal(item.releaseYear, expectedYear(item), item.title);
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
