import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { createUser, findUserByEmail, findUserById, updateUser } from '../db/store.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { requireAuth, sessionEnded, signToken } from '../middleware/auth.js';

export const authRouter = Router();

function toPublicUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

authRouter.post('/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  if (findUserByEmail(email)) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const user = {
    id: uuid(),
    email,
    name: name || email.split('@')[0],
    passwordHash: await hashPassword(password),
    preferences: { favoriteGenres: [], theme: 'dark' },
    savedMedia: [],
    createdAt: new Date().toISOString(),
  };
  createUser(user);

  const token = signToken({ sub: user.id });
  res.status(201).json({ token, user: toPublicUser(user) });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
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
  const updated = updateUser(req.userId, {
    preferences: { ...user.preferences, ...req.body },
  });
  res.json({ user: toPublicUser(updated) });
});
