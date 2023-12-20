import assert from "node:assert/strict";
import test from "node:test";
import { createDeezerClient, normalizeName, yearOf } from "./deezer.js";

const PICTURE = "https://cdn-images.dzcdn.net/images/artist/abc/1000x1000-000000-80-0-0.jpg";

// Answers by path ("/search/artist", "/album/7", ...); `calls` records each URL asked for.
function stubDeezer(routes) {
  const calls = [];
  const fetch = async (input, init) => {
    const url = new URL(input);
    calls.push(url);
    const route = routes[url.pathname];
    if (typeof route === "function") return route(url, init);
    if (route === undefined) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, json: async () => route };
  };
  return { fetch, calls };
}

test("normalises case, accents and punctuation, reading & as and", () => {
  assert.equal(normalizeName("AC/DC"), "ac dc");
  assert.equal(normalizeName("Beyoncé"), "beyonce");
  assert.equal(normalizeName("Guns N' Roses"), "guns n roses");
  assert.equal(normalizeName("Simon & Garfunkel"), normalizeName("simon and garfunkel"));
  assert.equal(normalizeName("宇多田ヒカル"), "宇多田ヒカル");
});

test("reads the year of a Deezer date and treats unknown dates as none", () => {
  assert.equal(yearOf("1997-06-17"), 1997);
  assert.equal(yearOf("0000-00-00"), null);
  assert.equal(yearOf(""), null);
  assert.equal(yearOf(undefined), null);
  assert.equal(yearOf("soon"), null);
});

test("finds an artist's photo by name, even when the match isn't first", async () => {
  const { fetch, calls } = stubDeezer({
    "/search/artist": {
      data: [
        { name: "AC/DC Recovered", picture_xl: "https://example.test/tribute.jpg" },
        { name: "AC/DC", picture_xl: PICTURE },
      ],
    },
  });
  const deezer = createDeezerClient({ fetch });

  assert.equal(await deezer.artistPicture("ac dc"), PICTURE);
  assert.equal(calls[0].hostname, "api.deezer.com");
  assert.equal(calls[0].searchParams.get("q"), "ac dc");
});

test("rejects an artist whose name only resembles the one asked for", async () => {
  const { fetch } = stubDeezer({
    "/search/artist": {
      data: [
        { name: "Prince Royce", picture_xl: "https://example.test/royce.jpg" },
        { name: "The Princess", picture_xl: "https://example.test/princess.jpg" },
      ],
    },
  });
  const deezer = createDeezerClient({ fetch });

  assert.equal(await deezer.artistPicture("Prince"), null);
});

test("gets an album's year from the album that matches both title and artist", async () => {
  const { fetch, calls } = stubDeezer({
    "/search/album": {
      data: [
        { id: 1, title: "OK Computer (8-bit)", artist: { name: "Radiohead" } },
        { id: 2, title: "OK Computer", artist: { name: "Quinton Sung" } },
        { id: 3, title: "OK Computer", artist: { name: "Radiohead" } },
      ],
    },
    "/album/3": { title: "OK Computer", release_date: "1997-06-17" },
  });
  const deezer = createDeezerClient({ fetch });

  assert.equal(await deezer.albumYear("Radiohead", "OK Computer"), 1997);
  assert.deepEqual(calls.map((url) => url.pathname), ["/search/album", "/album/3"]);
});

test("gets a song's year from its album and ignores a cover by another artist", async () => {
  const { fetch, calls } = stubDeezer({
    "/search": {
      data: [
        { id: 10, title: "Karma Police", artist: { name: "Vitamin String Quartet" }, album: { id: 6 } },
        { id: 11, title: "Karma Police", artist: { name: "Radiohead" }, album: { id: 7 } },
      ],
    },
    "/album/7": { release_date: "1997-06-17" },
  });
  const deezer = createDeezerClient({ fetch });

  assert.equal(await deezer.songYear("Radiohead", "Karma Police"), 1997);
  assert.equal(await deezer.songYear("Radiohead", "No Surprises"), null);
  assert.deepEqual(calls.map((url) => url.pathname), ["/search", "/album/7", "/search"]);
});

test("a matched track without a numeric album id gives no year and fetches nothing", async () => {
  for (const album of [undefined, { id: "../user/1" }, { id: 1.5 }]) {
    const { fetch, calls } = stubDeezer({
      "/search": { data: [{ id: 5, title: "Song", artist: { name: "Band" }, album }] },
    });
    assert.equal(await createDeezerClient({ fetch }).songYear("Band", "Song"), null);
    assert.deepEqual(calls.map((url) => url.pathname), ["/search"]);
  }
});

test("album cards and songs on the same album share one album fetch", async () => {
  const { fetch, calls } = stubDeezer({
    "/search/album": { data: [{ id: 7, title: "Discovery", artist: { name: "Daft Punk" } }] },
    "/search": (url) => ({
      ok: true,
      json: async () => ({
        data: [{ id: 1, title: url.searchParams.get("q").replace("Daft Punk ", ""), artist: { name: "Daft Punk" }, album: { id: 7 } }],
      }),
    }),
    "/album/7": { release_date: "2001-03-12" },
  });
  const deezer = createDeezerClient({ fetch });

  const years = await Promise.all([
    deezer.songYear("Daft Punk", "Voyager"),
    deezer.albumYear("Daft Punk", "Discovery"),
    deezer.songYear("Daft Punk", "Digital Love"),
  ]);
  assert.deepEqual(years, [2001, 2001, 2001]);
  assert.equal(await deezer.songYear("Daft Punk", "Aerodynamic"), 2001);
  assert.equal(calls.filter((url) => url.pathname === "/album/7").length, 1);
  assert.equal(calls.length, 5);
});

test("every kind of failure resolves to null instead of throwing", async () => {
  const failures = {
    "server error": async () => ({ ok: false, status: 500, json: async () => ({}) }),
    "error body": async () => ({ ok: true, json: async () => ({ error: { code: 800, message: "no data" } }) }),
    "bad JSON": async () => ({ ok: true, json: async () => { throw new SyntaxError("Unexpected token"); } }),
    "network error": async () => { throw new TypeError("fetch failed"); },
    "no data field": async () => ({ ok: true, json: async () => ({}) }),
  };
  for (const [name, fetch] of Object.entries(failures)) {
    const deezer = createDeezerClient({ fetch });
    assert.equal(await deezer.artistPicture("Muse"), null, name);
    assert.equal(await deezer.albumYear("Muse", "Absolution"), null, name);
    assert.equal(await deezer.songYear("Muse", "Hysteria"), null, name);
  }
});

test("a Deezer that never answers is given up on after the timeout, and the request aborted", async () => {
  let signal;
  const deezer = createDeezerClient({
    timeoutMs: 50,
    fetch: (_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    },
  });

  const started = Date.now();
  assert.equal(await deezer.artistPicture("Muse"), null);
  assert.ok(Date.now() - started < 500, "the lookup should not wait past its timeout");
  assert.equal(signal.aborted, true);
});

test("remembers answers, including no match, until the TTL passes", async () => {
  let clock = 0;
  const { fetch, calls } = stubDeezer({ "/search/artist": { data: [{ name: "ABBA", picture_xl: PICTURE }] } });
  const deezer = createDeezerClient({ fetch, ttlMs: 1000, now: () => clock });

  assert.equal(await deezer.artistPicture("ABBA"), PICTURE);
  assert.equal(await deezer.artistPicture("abba"), PICTURE);
  assert.equal(await deezer.artistPicture("Nobody"), null);
  assert.equal(await deezer.artistPicture("Nobody"), null);
  assert.equal(calls.length, 2);

  clock = 1000;
  await deezer.artistPicture("ABBA");
  assert.equal(calls.length, 3);
});

test("doesn't remember failures, and concurrent lookups share one request", async () => {
  let fail = true;
  let requests = 0;
  const deezer = createDeezerClient({
    fetch: async () => {
      requests += 1;
      if (fail) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, json: async () => ({ data: [{ name: "Muse", picture_xl: PICTURE }] }) };
    },
  });

  assert.equal(await deezer.artistPicture("Muse"), null);
  fail = false;
  const [first, second] = await Promise.all([deezer.artistPicture("Muse"), deezer.artistPicture("MUSE")]);
  assert.deepEqual([first, second], [PICTURE, PICTURE]);
  assert.equal(requests, 2);
});

test("skips lookups beyond the request budget, then resumes when the window passes", async () => {
  let clock = 0;
  const { fetch, calls } = stubDeezer({ "/search/artist": { data: [] } });
  const deezer = createDeezerClient({ fetch, requestBudget: 2, budgetWindowMs: 5000, now: () => clock });

  await deezer.artistPicture("One");
  await deezer.artistPicture("Two");
  assert.equal(await deezer.artistPicture("Three"), null);
  assert.equal(calls.length, 2);

  clock = 5000;
  await deezer.artistPicture("Three");
  assert.equal(calls.length, 3, "a skipped lookup isn't cached, so it is tried again");
});

test("counts each request against the budget as it is made, and retries a year whose album fetch was skipped", async () => {
  let clock = 0;
  const { fetch, calls } = stubDeezer({
    "/search/album": { data: [{ id: 3, title: "Record", artist: { name: "Band" } }, { id: 4, title: "Other", artist: { name: "Band" } }] },
    "/album/3": { release_date: "1999-01-01" },
    "/album/4": { release_date: "2001-01-01" },
  });
  const deezer = createDeezerClient({ fetch, requestBudget: 3, now: () => clock });

  const years = await Promise.all([deezer.albumYear("Band", "Record"), deezer.albumYear("Band", "Other")]);
  assert.equal(calls.length, 3);
  assert.equal(years.filter((year) => year === null).length, 1, "the album fetch beyond the budget is skipped");

  clock = 5000;
  assert.deepEqual(await Promise.all([deezer.albumYear("Band", "Record"), deezer.albumYear("Band", "Other")]), [1999, 2001]);
  assert.equal(calls.length, 4, "only the skipped album fetch is made again; the search is remembered");
});

test("a failed or hanging album fetch gives no year, isn't remembered, and doesn't hold up the lookup", async () => {
  let album = () => ({ ok: true, json: async () => ({ error: { code: 800, message: "no data" } }) });
  const { fetch, calls } = stubDeezer({
    "/search/album": { data: [{ id: 3, title: "Record", artist: { name: "Band" } }] },
    "/album/3": () => album(),
  });
  const deezer = createDeezerClient({ fetch, timeoutMs: 50 });

  assert.equal(await deezer.albumYear("Band", "Record"), null);
  album = () => new Promise(() => {});
  const started = Date.now();
  assert.equal(await deezer.albumYear("Band", "Record"), null);
  assert.ok(Date.now() - started < 500, "the lookup should not wait past its timeout");
  // The shared album fetch has its own deadline, a moment behind the lookup's; until it
  // passes, a new lookup would join the hung fetch.
  await new Promise((resolve) => setTimeout(resolve, 60));

  album = () => ({ ok: true, json: async () => ({ release_date: "1999-01-01" }) });
  assert.equal(await deezer.albumYear("Band", "Record"), 1999);
  assert.deepEqual(calls.map((url) => url.pathname), ["/search/album", "/album/3", "/album/3", "/album/3"]);
});

test("ignores a match whose id isn't a number or whose photo isn't https", async () => {
  const { fetch, calls } = stubDeezer({
    "/search/album": { data: [{ id: "../user/1", title: "Record", artist: { name: "Band" } }] },
    "/search/artist": { data: [{ name: "Band", picture_xl: "http://insecure.test/band.jpg" }] },
  });
  const deezer = createDeezerClient({ fetch });

  assert.equal(await deezer.albumYear("Band", "Record"), null);
  assert.equal(await deezer.artistPicture("Band"), null);
  assert.deepEqual(calls.map((url) => url.pathname), ["/search/album", "/search/artist"]);
});

test("forgets the oldest answers once the cache is full", async () => {
  const { fetch, calls } = stubDeezer({ "/search/artist": { data: [] } });
  const deezer = createDeezerClient({ fetch, maxEntries: 2 });

  await deezer.artistPicture("One");
  await deezer.artistPicture("Two");
  await deezer.artistPicture("Three");
  await deezer.artistPicture("Two");
  assert.equal(calls.length, 3);
  await deezer.artistPicture("One");
  assert.equal(calls.length, 4);
});
