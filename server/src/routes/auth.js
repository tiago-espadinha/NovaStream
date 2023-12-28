import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { createUser, deleteUser, findUserByEmail, updateCredentials, updateUser } from '../db/store.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../utils/password.js';
import { findSessionUser, requireAuth, sessionEnded, sessionToken } from '../middleware/auth.js';
import { parseCredentials, parsePasswordChange, parsePreferences } from '../utils/validate.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { clientIp, passwordAttempts } from '../utils/passwordAttempts.js';

export const authRouter = Router();

function toPublicUser(user) {
  const { passwordHash, sessionVersion, ...rest } = user;
  return rest;
}

// Not 401: clients treat that as "session ended" and would sign the user out for a typo.
function wrongPassword(res) {
  return res.status(403).json({ error: 'That password isn’t right.', code: 'wrong_password' });
}

function tooManyAttempts(res, seconds) {
  const minutes = Math.ceil(seconds / 60);
  res.set('Retry-After', String(seconds));
  return res.status(429).json({
    error: `Too many password attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
    code: 'rate_limited',
    retryAfterSeconds: seconds,
  });
}

// Every password check goes through here, so a rate-limited caller never reaches bcrypt.
async function attemptPassword(req, email, password, passwordHash) {
  const who = { email, ip: clientIp(req) };
  const wait = await passwordAttempts.admit(who);
  if (wait) return { wait };
  // Unknown emails still pay for one compare, so timing doesn't reveal which accounts exist.
  const ok = (await verifyPassword(password, passwordHash || DUMMY_PASSWORD_HASH)) && Boolean(passwordHash);
  if (ok) await passwordAttempts.succeeded(who);
  return { ok };
}

authRouter.post('/register', asyncRoute(async (req, res) => {
  const { value, error } = parseCredentials(req.body, { register: true });
  if (error) return res.status(400).json({ error });

  if (await findUserByEmail(value.email)) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const user = {
    id: randomUUID(),
    email: value.email,
    name: value.name,
    passwordHash: await hashPassword(value.password),
    preferences: { favoriteGenres: [], theme: 'dark' },
    savedMedia: [],
    createdAt: new Date().toISOString(),
  };
  if (!(await createUser(user))) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const token = sessionToken(user);
  res.status(201).json({ token, user: toPublicUser(user) });
}));

authRouter.post('/login', asyncRoute(async (req, res) => {
  const { value, error } = parseCredentials(req.body);
  if (error) return res.status(400).json({ error });

  const user = await findUserByEmail(value.email);
  const { wait, ok } = await attemptPassword(req, value.email, value.password, user?.passwordHash);
  if (wait) return tooManyAttempts(res, wait);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const token = sessionToken(user);
  res.json({ token, user: toPublicUser(user) });
}));

authRouter.get('/me', requireAuth, asyncRoute(async (req, res) => {
  const user = await findSessionUser(req);
  if (!user) return sessionEnded(res);
  res.json({ user: toPublicUser(user) });
}));

authRouter.patch('/preferences', requireAuth, asyncRoute(async (req, res) => {
  const user = await findSessionUser(req);
  if (!user) return sessionEnded(res);
  const { value, error } = parsePreferences(req.body);
  if (error) return res.status(400).json({ error });

  const updated = await updateUser(req.userId, {
    preferences: { ...user.preferences, ...value },
  });
  res.json({ user: toPublicUser(updated) });
}));

// Bumping the session version signs out every other device; this one continues with a new token.
authRouter.put('/password', requireAuth, asyncRoute(async (req, res) => {
  const user = await findSessionUser(req);
  if (!user) return sessionEnded(res);
  const { value, error } = parsePasswordChange(req.body);
  if (error) return res.status(400).json({ error });
  const { wait, ok } = await attemptPassword(req, user.email, value.currentPassword, user.passwordHash);
  if (wait) return tooManyAttempts(res, wait);
  if (!ok) return wrongPassword(res);

  const updated = await updateCredentials(user.id, {
    passwordHash: await hashPassword(value.newPassword),
    sessionVersion: (user.sessionVersion ?? 0) + 1,
  });
  if (!updated) return sessionEnded(res);
  res.json({ token: sessionToken(updated), user: toPublicUser(updated) });
}));

// Saved titles and collections live on the user record, so deleting it removes them too.
authRouter.delete('/account', requireAuth, asyncRoute(async (req, res) => {
  const user = await findSessionUser(req);
  if (!user) return sessionEnded(res);
  const { password } = req.body || {};
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Enter your password to delete your account.' });
  }
  const { wait, ok } = await attemptPassword(req, user.email, password, user.passwordHash);
  if (wait) return tooManyAttempts(res, wait);
  if (!ok) return wrongPassword(res);

  await deleteUser(user.id);
  res.status(204).end();
}));
