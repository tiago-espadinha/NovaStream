// Deezer's public API (no key) fills in what Last.fm lacks: artist photos and release years.
// Every lookup the client offers resolves to a value or null and never throws, so a Deezer
// outage leaves the Last.fm output exactly as it was.
const BASE = "https://api.deezer.com";

// One lookup (a search plus, for years, the album it found) gets this long in total, so a
// slow Deezer adds at most this much to a music search.
export const DEEZER_TIMEOUT_MS = 1000;
// Release years and artist photos rarely change.
export const DEEZER_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 1000;
// Deezer is commonly quoted at 50 requests per 5 seconds per IP; stay under it and skip
// requests beyond that rather than queue them behind a search. A cold "all" music search
// makes up to 25 searches, and songs share the album fetch of an album card (or of another
// song), so a search for an artist fits; one whose songs are on other albums may not, and
// its skipped years come on the next search.
const REQUEST_BUDGET = 40;
const BUDGET_WINDOW_MS = 5000;
const SEARCH_LIMIT = 10;

/** Lowercase, accents and punctuation removed, "&" read as "and": "AC/DC" → "ac dc". */
export function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The year of a Deezer "YYYY-MM-DD" date; Deezer uses "0000-00-00" for unknown. */
export function yearOf(date) {
  const year = Number(/^(\d{4})-/.exec(date ?? "")?.[1]);
  return year > 0 ? year : null;
}

/**
 * `fetch` defaults to the global one at call time, so tests that stub `globalThis.fetch`
 * also reach the default client.
 */
export function createDeezerClient({
  fetch: fetchFn = (...args) => globalThis.fetch(...args),
  timeoutMs = DEEZER_TIMEOUT_MS,
  ttlMs = DEEZER_TTL_MS,
  now = Date.now,
  requestBudget = REQUEST_BUDGET,
  budgetWindowMs = BUDGET_WINDOW_MS,
  maxEntries = MAX_ENTRIES,
} = {}) {
  const entries = new Map();
  const requestTimes = [];

  // Each request takes its slot as it is made. Reserving a lookup's search and album fetch
  // together would skip lookups whose album turns out to be fetched already.
  function reserve() {
    const cutoff = now() - budgetWindowMs;
    while (requestTimes.length && requestTimes[0] <= cutoff) requestTimes.shift();
    if (requestTimes.length >= requestBudget) return false;
    requestTimes.push(now());
    return true;
  }

  async function get(path, params, signal) {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetchFn(url, { signal });
    if (!res.ok) throw new Error(`Deezer request failed: ${res.status}`);
    const data = await res.json();
    // Deezer reports errors (including "no data") as a 200 with an error body.
    if (data?.error) throw new Error(`Deezer error ${data.error.code}`);
    return data;
  }

  function withDeadline(work) {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`Deezer lookup timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return Promise.race([work(controller.signal), deadline]).finally(() => clearTimeout(timer));
  }

  // One request whose answer, including "no match", is remembered for `ttlMs`; failures and
  // requests skipped for lack of budget aren't, so they are tried again next time.
  // Concurrent callers share one request.
  function lookup(key, work) {
    const cached = entries.get(key);
    if (cached && (cached.pending || cached.expiresAt > now())) return cached.promise;
    if (!reserve()) return Promise.reject(new Error("Deezer request budget spent"));

    const entry = { pending: true, expiresAt: 0 };
    entry.promise = withDeadline(work).then(
      (value) => {
        entry.pending = false;
        entry.expiresAt = now() + ttlMs;
        return value ?? null;
      },
      (error) => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      },
    );
    entries.delete(key);
    entries.set(key, entry);
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    return entry.promise;
  }

  const orNull = (promise) => promise.catch(() => null);

  // Search results carry no date, so a year takes a search for the album (remembered on its
  // own, so a year skipped for budget costs only the album fetch next time) and a fetch of
  // that album, keyed by its Deezer id so album cards and songs on it share one request.
  function releaseYear(searchKey, findAlbumId) {
    return orNull(withDeadline(async (signal) => {
      const albumId = await lookup(searchKey, findAlbumId);
      // Don't spend a request on an album fetch the caller stopped waiting for.
      if (albumId === null || signal.aborted) return null;
      return lookup(`album-id|${albumId}`, async (signal) =>
        yearOf((await get(`/album/${albumId}`, {}, signal)).release_date));
    }));
  }

  const sameName = (a, b) => {
    const left = normalizeName(a);
    return left !== "" && left === normalizeName(b);
  };

  return {
    /** The artist's photo, or null when Deezer has no artist of exactly that name. */
    artistPicture(name) {
      return orNull(lookup(`artist|${normalizeName(name)}`, async (signal) => {
        const data = await get("/search/artist", { q: name, limit: SEARCH_LIMIT }, signal);
        const match = (data.data ?? []).find((artist) => sameName(artist?.name, name));
        const picture = match?.picture_xl || match?.picture_big;
        return typeof picture === "string" && picture.startsWith("https://") ? picture : null;
      }));
    },

    /** The album's release year. */
    albumYear(artist, title) {
      return releaseYear(`album|${normalizeName(artist)}|${normalizeName(title)}`, async (signal) => {
        const data = await get("/search/album", { q: `${artist} ${title}`, limit: SEARCH_LIMIT }, signal);
        const match = (data.data ?? []).find(
          (album) => sameName(album?.title, title) && sameName(album?.artist?.name, artist),
        );
        return Number.isSafeInteger(match?.id) ? match.id : null;
      });
    },

    /** The song's release year: that of the album of the track Deezer matches by title and artist. */
    songYear(artist, title) {
      return releaseYear(`song|${normalizeName(artist)}|${normalizeName(title)}`, async (signal) => {
        const data = await get("/search", { q: `${artist} ${title}`, limit: SEARCH_LIMIT }, signal);
        const match = (data.data ?? []).find(
          (track) => sameName(track?.title, title) && sameName(track?.artist?.name, artist),
        );
        return Number.isSafeInteger(match?.album?.id) ? match.album.id : null;
      });
    },
  };
}

export const deezer = createDeezerClient();
