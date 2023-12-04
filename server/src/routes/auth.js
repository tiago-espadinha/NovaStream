import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { createUser, findUserByEmail, findUserById, updateUser } from '../db/store.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { requireAuth, sessionEnded, signToken } from '../middleware/auth.js';
import { parseCredentials, parsePreferences } from '../utils/validate.js';

export const authRouter = Router();

function toPublicUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

authRouter.post('/register', async (req, res) => {
  const { value, error } = parseCredentials(req.body, { register: true });
  if (error) return res.status(400).json({ error });

  if (findUserByEmail(value.email)) {
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
  createUser(user);

  const token = signToken({ sub: user.id });
  res.status(201).json({ token, user: toPublicUser(user) });
});

authRouter.post('/login', async (req, res) => {
  const { value, error } = parseCredentials(req.body);
  if (error) return res.status(400).json({ error });

  const user = findUserByEmail(value.email);
  if (!user || !(await verifyPassword(value.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken({ sub: user.id });
  res.json({ token, user: toPublicUser(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = findUserById(req.userId);
  if (!user) return sessionEnded(res);
  res.json({ user: toPublicUser(user) });
});

authRouter.patch('/preferences', requireAuth, (req, res) => {
  const user = findUserById(req.userId);
  if (!user) return sessionEnded(res);
  const { value, error } = parsePreferences(req.body);
  if (error) return res.status(400).json({ error });

  const updated = updateUser(req.userId, {
    preferences: { ...user.preferences, ...value },
  });
  res.json({ user: toPublicUser(updated) });
});
