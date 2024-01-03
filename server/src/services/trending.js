import { PROVIDER_TIMEOUT_MS, withTimeout } from './providerError.js';
import { searchAcross } from './searchAcross.js';
import { LOCALIZED_TYPES } from '../utils/lang.js';
import { trendingMovies, trendingTv } from './tmdb.js';
import { trendingMusic } from './lastfm.js';
import { trendingBooks } from './openLibrary.js';
import { trendingGames } from './rawg.js';

// Provider windows are a week (TMDb, Open Library) or a month (RAWG), so a few hours of
// staleness is invisible and keeps Home from calling every provider on each visit.
export const TRENDING_TTL_MS = 6 * 60 * 60 * 1000;
const ITEMS_PER_TYPE = 4;

/**
 * Remembers each type's list for `ttlMs`. Concurrent callers share one in-flight request,
 * and failures aren't remembered, so a provider that was down is retried on the next call.
 */
function cachedLoader(sources, { ttlMs, timeoutMs, now }) {
  const entries = new Map();
  return (type, lang) => {
    // Films and TV come back in the viewer's language, so each language gets its own entry.
    const localized = LOCALIZED_TYPES.has(type);
    const cacheKey = localized ? `${type}:${lang}` : type;
    const cached = entries.get(cacheKey);
    if (cached && (cached.pending || cached.expiresAt > now())) return cached.promise;

    const entry = { pending: true, expiresAt: 0 };
    entry.promise = withTimeout(() => (localized ? sources[type](lang) : sources[type]()), timeoutMs, `${type} trending`);
    entries.set(cacheKey, entry);
    entry.promise.then(
      () => {
        entry.pending = false;
        entry.expiresAt = now() + ttlMs;
      },
      () => entries.delete(cacheKey),
    );
    return entry.promise;
  };
}

/**
 * Each provider ranks by its own popularity signal (views, chart plays, library adds), and
 * those scales can't be compared. Rather than invent a combined score, keep each provider's
 * order and take one item from each type in turn.
 */
function interleaveByType(items, types) {
  const queues = types.map((type) => items.filter((item) => item.type === type));
  const mixed = [];
  for (let i = 0; queues.some((queue) => i < queue.length); i += 1) {
    for (const queue of queues) if (i < queue.length) mixed.push(queue[i]);
  }
  return mixed;
}

export function createTrendingFeed(
  sources,
  {
    ttlMs = TRENDING_TTL_MS,
    timeoutMs = PROVIDER_TIMEOUT_MS,
    now = Date.now,
    log = console.warn,
  } = {},
) {
  const types = Object.keys(sources);
  const load = cachedLoader(sources, { ttlMs, timeoutMs, now });
  return async (lang = 'en') => {
    const { results, errors } = await searchAcross(
      types,
      async (type) => (await load(type, lang)).slice(0, ITEMS_PER_TYPE),
      { timeoutMs, log, label: 'trending' },
    );
    return { results: interleaveByType(results, types), errors };
  };
}

export const getTrending = createTrendingFeed({
  movie: trendingMovies,
  tv: trendingTv,
  music: trendingMusic,
  book: trendingBooks,
  game: trendingGames,
});
