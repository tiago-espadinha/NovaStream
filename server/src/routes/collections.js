import { Router } from 'express';
import { updateUser } from '../db/store.js';
import { findSessionUser, requireAuth, sessionEnded } from '../middleware/auth.js';
import { parseCollections } from '../utils/validate.js';
import { asyncRoute } from '../utils/asyncRoute.js';

export const collectionsRouter = Router();
collectionsRouter.use(requireAuth);

const EMPTY = { custom: [], assignments: {}, media: {} };

// GET /api/collections — the signed-in user's custom collections and title assignments.
collectionsRouter.get('/', asyncRoute(async (req, res) => {
  const user = await findSessionUser(req);
  if (!user) return sessionEnded(res);
  res.json({ collections: user.collections ?? EMPTY });
}));

// PUT /api/collections — replaces the whole document (last write wins; the client
// sends one save at a time).
collectionsRouter.put('/', asyncRoute(async (req, res) => {
  if (!(await findSessionUser(req))) return sessionEnded(res);
  const { value, error } = parseCollections(req.body);
  if (error) return res.status(400).json({ error });
  const updated = await updateUser(req.userId, { collections: value });
  if (!updated) return sessionEnded(res);
  res.json({ collections: updated.collections });
}));
