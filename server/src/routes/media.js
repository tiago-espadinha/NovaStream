import { Router } from 'express';
import { getMovieDetail, getTvDetail } from '../services/tmdb.js';
import { getBookDetail } from '../services/openLibrary.js';
import { getGameDetail } from '../services/rawg.js';
import { getMusicDetail } from '../services/lastfm.js';
import { PROVIDER_TIMEOUT_MS, withTimeout } from '../services/providerError.js';

export const mediaRouter = Router();

const GETTERS = {
  movie: getMovieDetail,
  tv: getTvDetail,
  book: getBookDetail,
  game: getGameDetail,
  music: getMusicDetail,
};

// GET /api/media/:type/:id  — :id is the *provider's* raw id (not the "type-id" composite)
mediaRouter.get('/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  if (!Object.hasOwn(GETTERS, type)) return res.status(400).json({ error: `Unknown type "${type}"` });
  const getter = GETTERS[type];

  try {
    const detail = await withTimeout(() => getter(id), PROVIDER_TIMEOUT_MS, `${type} detail`);
    res.json(detail);
  } catch (err) {
    console.warn(`[media] ${type}/${JSON.stringify(id)} failed: ${err.message}`);
    res.status(502).json({ error: 'The source couldn’t be reached.' });
  }
});
