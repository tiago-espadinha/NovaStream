import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { createUser, findUserByEmail, updateUser } from '../db/store.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { findSessionUser, requireAuth, sessionEnded, sessionToken } from '../middleware/auth.js';
import { parseCredentials, parsePreferences } from '../utils/validate.js';
import { asyncRoute } from '../utils/asyncRoute.js';

export const authRouter = Router();

function toPublicUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
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
  if (!user || !(await verifyPassword(value.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

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
