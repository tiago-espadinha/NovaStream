import { Router } from 'express';
import { addSavedMedia, removeSavedMedia } from '../db/store.js';
import { findSessionUser, requireAuth, sessionEnded } from '../middleware/auth.js';
import { MAX_SAVED_MEDIA, parseMediaSnapshot } from '../utils/validate.js';
import { asyncRoute } from '../utils/asyncRoute.js';

export const savedRouter = Router();
savedRouter.use(requireAuth);

savedRouter.get('/', asyncRoute(async (req, res) => {
  const user = await findSessionUser(req);
  if (!user) return sessionEnded(res);
  res.json({ savedMedia: user.savedMedia });
}));

// Body is a snapshot of the media item (id, title, type, rating, genres, posterUrl, ...)
// so the saved list can render without an extra round trip; re-fetch /api/media for
// fresh details when the user opens it.
savedRouter.post('/', asyncRoute(async (req, res) => {
  const user = await findSessionUser(req);
  if (!user) return sessionEnded(res);
  const { value: media, error } = parseMediaSnapshot(req.body);
  if (error) return res.status(400).json({ error });
  const alreadySaved = user.savedMedia.some((saved) => saved.id === media.id);
  if (!alreadySaved && user.savedMedia.length >= MAX_SAVED_MEDIA) {
    return res.status(409).json({ error: `You can save up to ${MAX_SAVED_MEDIA} titles. Remove some to add more.` });
  }
  res.status(201).json({ savedMedia: await addSavedMedia(req.userId, media) });
}));

savedRouter.delete('/:id', asyncRoute(async (req, res) => {
  if (!(await findSessionUser(req))) return sessionEnded(res);
  const savedMedia = await removeSavedMedia(req.userId, req.params.id);
  if (!savedMedia) return sessionEnded(res);
  res.json({ savedMedia });
}));
