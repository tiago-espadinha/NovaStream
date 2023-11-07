import { Router } from 'express';
import { getMovieDetail, getTvDetail } from '../services/tmdb.js';
import { getBookDetail } from '../services/openLibrary.js';
import { getGameDetail } from '../services/rawg.js';
import { getMusicDetail } from '../services/lastfm.js';
import { errorCode, PROVIDER_TIMEOUT_MS, withTimeout } from '../services/providerError.js';

export const mediaRouter = Router();

// Client-facing status and copy per failure kind; upstream details stay in the server log.
const FAILURES = {
  not_found: { status: 404, error: 'This title isn’t available anymore.' },
  timeout: { status: 504, error: 'The source took too long to respond.' },
  not_configured: { status: 503, error: 'This source isn’t set up on the server.' },
  unavailable: { status: 502, error: 'The source couldn’t be reached.' },
};

/** Status and body for a failed detail lookup; never includes the upstream message. */
export function failureResponse(err) {
  const code = errorCode(err);
  return { status: FAILURES[code].status, body: { error: FAILURES[code].error, code } };
}

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
    const { status, body } = failureResponse(err);
    console.warn(`[media] ${type}/${JSON.stringify(id)} failed (${body.code}): ${err.message}`);
    res.status(status).json(body);
  }
});
