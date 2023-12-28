// Expiring counters for password attempts, kept apart from the user records in store.js so a
// counter write can never race a write of the user. Same backend choice as the store:
// - Upstash Redis when its REST URL/token are set, so every serverless instance on Vercel
//   shares one count.
// - Otherwise an in-memory map, which is enough for a single local dev process.
// A window starts at a key's first hit and is never extended by later ones.

export function createMemoryCounters({ now = Date.now } = {}) {
  const counters = new Map();

  function current(key) {
    const entry = counters.get(key);
    if (entry && entry.expiresAt <= now()) {
      counters.delete(key);
      return null;
    }
    return entry ?? null;
  }

  return {
    /** Counts one more hit and resolves to the new count and the seconds left in the window. */
    async hit(key, windowSeconds) {
      const entry = current(key) ?? { count: 0, expiresAt: now() + windowSeconds * 1000 };
      entry.count += 1;
      counters.set(key, entry);
      return { count: entry.count, secondsLeft: Math.ceil((entry.expiresAt - now()) / 1000) };
    },
    async undo(key) {
      const entry = current(key);
      if (entry) entry.count -= 1;
    },
    async clear(key) {
      counters.delete(key);
    },
  };
}

export function createRedisCounters({ url, token, fetchImpl = fetch }) {
  async function post(path, body) {
    const res = await fetchImpl(`${url}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.error) throw new Error(`Redis ${path || body[0]} failed: ${result.error || res.status}`);
    return result;
  }

  const command = async (...args) => (await post('', args)).result;

  return {
    // One transaction, so the count, its TTL and the answer can't drift apart: EXPIRE NX only
    // sets a TTL when the key has none, so it starts the window without ever extending it.
    async hit(key, windowSeconds) {
      const replies = await post('/multi-exec', [['INCR', key], ['EXPIRE', key, windowSeconds, 'NX'], ['TTL', key]]);
      const failed = replies.find((reply) => reply.error);
      if (failed) throw new Error(`Redis /multi-exec failed: ${failed.error}`);
      const [count, , ttl] = replies.map((reply) => reply.result);
      return { count, secondsLeft: Math.max(0, ttl) };
    },
    async undo(key) {
      await command('DECR', key);
    },
    async clear(key) {
      await command('DEL', key);
    },
  };
}

export function countersFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? createRedisCounters({ url, token }) : createMemoryCounters();
}
