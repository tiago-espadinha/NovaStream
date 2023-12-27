import jwt from 'jsonwebtoken';
import { findUserById } from '../db/store.js';

const ALGORITHM = 'HS256';

/**
 * Account routes need JWT_SECRET; search and detail don't. Without it, answer 503 with the
 * same not_configured code providers use, rather than a 500 or a misleading 401.
 */
export function requireAuthConfig(_req, res, next) {
  if (process.env.JWT_SECRET) return next();
  res.status(503).json({ error: 'Accounts aren’t set up on the server yet.', code: 'not_configured' });
}

/**
 * A token carries the account's session version; changing the password bumps it, which ends
 * every session signed in before. Accounts and tokens from before versions count as 0.
 */
export function sessionToken(user) {
  return signToken({ sub: user.id, ver: user.sessionVersion ?? 0 });
}

export function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// Clients sign the user out on any 401, so every session failure uses that status.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing or malformed Authorization header' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });
    req.userId = payload.sub;
    req.sessionVersion = payload.ver ?? 0;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** The signed-in user, or null when the account is gone or the token predates a password change. */
export async function findSessionUser(req) {
  const user = await findUserById(req.userId);
  if (!user || (user.sessionVersion ?? 0) !== req.sessionVersion) return null;
  return user;
}

/** For a valid token whose account no longer exists: the session is over, not "not found". */
export function sessionEnded(res) {
  return res.status(401).json({ error: 'Your session has ended. Sign in again.' });
}
