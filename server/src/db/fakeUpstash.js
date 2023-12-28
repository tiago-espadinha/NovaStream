// Test helper, not imported by the app: answers GET, MGET, SET (with NX or XX), MSET, EXISTS, DEL,
// INCR, DECR, EXPIRE (with NX) and TTL the way Upstash's REST endpoint does, from an in-memory map,
// plus a list of them sent to `/multi-exec`. Keys expire against `now`, so tests can move the clock instead of
// waiting. Unknown commands fail loudly, so a test can't pass because a command it depends on was
// silently ignored.
export function fakeUpstash({ now = Date.now } = {}) {
  const data = new Map();
  const expiresAt = new Map();
  const calls = [];

  function live(key) {
    if (expiresAt.has(key) && expiresAt.get(key) <= now()) {
      data.delete(key);
      expiresAt.delete(key);
    }
    return data.has(key);
  }

  // Like Redis, a SET or a key created by INCR/DECR starts without a TTL.
  function add(key, by) {
    const exists = live(key);
    if (!exists) expiresAt.delete(key);
    const result = Number(exists ? data.get(key) : 0) + by;
    data.set(key, String(result));
    return result;
  }

  function run([cmd, ...args]) {
    if (cmd === 'GET') return { result: live(args[0]) ? data.get(args[0]) : null };
    if (cmd === 'MGET') return { result: args.map((key) => (live(key) ? data.get(key) : null)) };
    if (cmd === 'MSET') {
      for (let i = 0; i < args.length; i += 2) {
        expiresAt.delete(args[i]);
        data.set(args[i], args[i + 1]);
      }
      return { result: 'OK' };
    }
    if (cmd === 'SET') {
      const [key, value, flag] = args;
      if ((flag === 'NX' && live(key)) || (flag === 'XX' && !live(key))) return { result: null };
      expiresAt.delete(key);
      data.set(key, value);
      return { result: 'OK' };
    }
    if (cmd === 'EXISTS') return { result: args.filter((key) => live(key)).length };
    if (cmd === 'DEL') {
      const existing = args.filter((key) => live(key));
      for (const key of existing) {
        data.delete(key);
        expiresAt.delete(key);
      }
      return { result: existing.length };
    }
    if (cmd === 'INCR') return { result: add(args[0], 1) };
    if (cmd === 'DECR') return { result: add(args[0], -1) };
    if (cmd === 'EXPIRE') {
      const [key, seconds, flag] = args;
      if (!live(key) || (flag === 'NX' && expiresAt.has(key))) return { result: 0 };
      expiresAt.set(key, now() + Number(seconds) * 1000);
      return { result: 1 };
    }
    if (cmd === 'TTL') {
      if (!live(args[0])) return { result: -2 };
      if (!expiresAt.has(args[0])) return { result: -1 };
      return { result: Math.ceil((expiresAt.get(args[0]) - now()) / 1000) };
    }
    return { error: `fakeUpstash: unsupported ${cmd}` };
  }

  const fetchImpl = async (url, init) => {
    calls.push(init);
    const body = JSON.parse(init.body);
    const reply = String(url).endsWith('/multi-exec') ? body.map(run) : run(body);
    if (reply.error) return { ok: false, status: 400, json: async () => reply };
    return { ok: true, json: async () => reply };
  };
  return { data, calls, fetchImpl };
}
