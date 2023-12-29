import { countersFromEnv } from '../db/attempts.js';
import { ipBlock, positiveInt } from './passwordAttempts.js';

/**
 * Limits sign-ups per client IP (per /64 for IPv6). Sign-up answers 409 for a taken email, so
 * every attempt counts, new email or not, and a success is never taken back: the limit is what
 * keeps that answer from being used to list accounts. When the counters are unreachable,
 * sign-ups go ahead, as password attempts do.
 */
export function createSignUpAttempts({ counters, ipMax, windowSeconds }) {
  return {
    /** Counts an attempt; resolves to the seconds to wait, or 0 when it can go ahead. */
    async admit(ip) {
      try {
        const hit = await counters.hit(`signup-attempts:ip:${ipBlock(ip)}`, windowSeconds);
        return hit.count > ipMax ? hit.secondsLeft || windowSeconds : 0;
      } catch (err) {
        console.error(`Sign-up attempt limit unavailable: ${err.message}`);
        return 0;
      }
    },
  };
}

export const signUpAttempts = createSignUpAttempts({
  counters: countersFromEnv(),
  ipMax: positiveInt(process.env.SIGNUP_ATTEMPTS_PER_IP, 10),
  windowSeconds: positiveInt(process.env.SIGNUP_ATTEMPT_WINDOW_SECONDS, 60 * 60),
});
