import { isIPv6 } from 'node:net';
import { countersFromEnv } from '../db/attempts.js';

/**
 * Limits failed password attempts per account (by email, so unknown emails count the same as
 * real ones and the limit can't reveal which exist) and per client IP. Each attempt is counted
 * before its password is checked, so parallel guesses can't all slip in ahead of the count; a
 * correct password then clears the account's count and takes the attempt back off the IP's, so
 * only failures count and signing in to your own account can't reset the budget for guessing
 * someone else's. When the counters are unreachable, attempts go ahead: an outage shouldn't lock
 * everyone out.
 */
export function createPasswordAttempts({ counters, accountMax, ipMax, windowSeconds }) {
  const accountKey = (email) => `pw-attempts:account:${email.toLowerCase()}`;
  const ipKey = (ip) => `pw-attempts:ip:${ipBlock(ip)}`;

  async function failOpen(work, fallback) {
    try {
      return await work();
    } catch (err) {
      console.error(`Password attempt limit unavailable: ${err.message}`);
      return fallback;
    }
  }

  return {
    /** Counts an attempt; resolves to the seconds to wait, or 0 when it can go ahead. */
    admit: (who) =>
      failOpen(async () => {
        const [account, ip] = await Promise.all([
          counters.hit(accountKey(who.email), windowSeconds),
          counters.hit(ipKey(who.ip), windowSeconds),
        ]);
        const over = [[account, accountMax], [ip, ipMax]].filter(([hit, max]) => hit.count > max);
        return over.length ? Math.max(...over.map(([hit]) => hit.secondsLeft || windowSeconds)) : 0;
      }, 0),
    succeeded: (who) =>
      failOpen(() => Promise.all([counters.clear(accountKey(who.email)), counters.undo(ipKey(who.ip))])),
  };
}

// An IPv6 client usually holds a whole /64 and can switch addresses inside it at will, so the
// block is what gets counted. An IPv4-mapped address (::ffff:1.2.3.4) counts as the IPv4 address
// it carries; anything else that isn't IPv6 (IPv4, 'unknown') is counted as it is.
export function ipBlock(ip) {
  const address = String(ip).split('%')[0];
  if (!isIPv6(address)) return ip;
  const groups = ipv6Groups(address);
  if (groups.slice(0, 6).join(':') === '0:0:0:0:0:65535') {
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join('.');
  }
  return `${groups.slice(0, 4).map((group) => group.toString(16)).join(':')}::/64`;
}

// The eight 16-bit groups of a valid IPv6 address, expanding `::` and a dotted IPv4 tail.
function ipv6Groups(address) {
  const hex = address.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/, (_, a, b, c, d) =>
    `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`);
  const [head, tail] = hex.split('::').map((part) => (part ? part.split(':') : []));
  const zeros = tail ? Array(8 - head.length - tail.length).fill('0') : [];
  return [...head, ...zeros, ...(tail || [])].map((group) => parseInt(group, 16));
}

// Vercel overwrites x-forwarded-for with the real client address; anywhere else the header is
// whatever the client sent, so the socket address is the only one to trust.
export function clientIp(req, env = process.env) {
  const forwarded = env.VERCEL && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export const passwordAttempts = createPasswordAttempts({
  counters: countersFromEnv(),
  accountMax: positiveInt(process.env.PASSWORD_ATTEMPTS_PER_ACCOUNT, 5),
  ipMax: positiveInt(process.env.PASSWORD_ATTEMPTS_PER_IP, 20),
  windowSeconds: positiveInt(process.env.PASSWORD_ATTEMPT_WINDOW_SECONDS, 15 * 60),
});
