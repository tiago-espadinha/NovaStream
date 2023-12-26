// Test helper, not imported by the app: answers GET, SET (with NX or XX) and DEL the way Upstash's
// REST endpoint does, from an in-memory map. Unknown commands fail loudly, so a test can't
// pass because a command it depends on was silently ignored.
export function fakeUpstash() {
  const data = new Map();
  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(init);
    const [cmd, ...args] = JSON.parse(init.body);
    let result;
    if (cmd === 'GET') {
      result = data.get(args[0]) ?? null;
    } else if (cmd === 'SET') {
      const [key, value, flag] = args;
      if ((flag === 'NX' && data.has(key)) || (flag === 'XX' && !data.has(key))) result = null;
      else {
        data.set(key, value);
        result = 'OK';
      }
    } else if (cmd === 'DEL') {
      result = args.filter((key) => data.delete(key)).length;
    } else {
      return { ok: false, status: 400, json: async () => ({ error: `fakeUpstash: unsupported ${cmd}` }) };
    }
    return { ok: true, json: async () => ({ result }) };
  };
  return { data, calls, fetchImpl };
}
