import { Router } from 'express';
import { getMovieDetail, getTvDetail, getTvSeason } from '../services/tmdb.js';
import { getBookDetail } from '../services/openLibrary.js';
import { getGameDetail } from '../services/rawg.js';
import { getArtistTopAlbums, getMusicDetail } from '../services/lastfm.js';
import { LOCALIZED_TYPES, parseLang } from '../utils/lang.js';
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

const TMDB_ID = /^\d{1,10}$/;
const SEASON_NUMBER = /^(0|[1-9]\d{0,2})$/;

/** The series id and season number, or null; checked before either reaches a TMDb URL. */
export function parseSeasonParams({ id, season }) {
  if (!TMDB_ID.test(id) || !SEASON_NUMBER.test(season)) return null;
  return { id, season: Number(season) };
}

function sendFailure(res, label, err) {
  const { status, body } = failureResponse(err);
  console.warn(`[media] ${label} failed (${body.code}): ${err.message}`);
  res.status(status).json(body);
}

// GET /api/media/tv/:id/season/:season — one season's episodes, fetched when the viewer picks it
mediaRouter.get('/tv/:id/season/:season', async (req, res) => {
  const params = parseSeasonParams(req.params);
  if (!params) return res.status(400).json({ error: 'Pick a valid series and season.' });

  try {
    const season = await withTimeout(
      () => getTvSeason(params.id, params.season, parseLang(req.query.lang)),
      PROVIDER_TIMEOUT_MS,
      'tv season',
    );
    res.json(season);
  } catch (err) {
    sendFailure(res, `tv/${params.id}/season/${params.season}`, err);
  }
});

// GET /api/media/music/:id/albums — an artist's top albums, fetched after the artist detail opens
mediaRouter.get('/music/:id/albums', async (req, res) => {
  try {
    const albums = await withTimeout(
      () => getArtistTopAlbums(req.params.id),
      PROVIDER_TIMEOUT_MS,
      'artist albums',
    );
    res.json({ albums });
  } catch (err) {
    sendFailure(res, `music/${JSON.stringify(req.params.id)}/albums`, err);
  }
});

// GET /api/media/:type/:id  — :id is the *provider's* raw id (not the "type-id" composite)
mediaRouter.get('/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  if (!Object.hasOwn(GETTERS, type)) return res.status(400).json({ error: `Unknown type "${type}"` });
  const getter = GETTERS[type];
  const lang = parseLang(req.query.lang);
  const load = LOCALIZED_TYPES.has(type) ? () => getter(id, lang) : () => getter(id);

  try {
    const detail = await withTimeout(load, PROVIDER_TIMEOUT_MS, `${type} detail`);
    res.json(detail);
  } catch (err) {
    sendFailure(res, `${type}/${JSON.stringify(id)}`, err);
  }
});
