import { Router } from 'express';
import { searchMovies, searchTv } from '../services/tmdb.js';
import { searchAcross } from '../services/searchAcross.js';

export const searchRouter = Router();

const MAX_QUERY_LENGTH = 200;

const SEARCHERS = {
  movie: searchMovies,
  tv: searchTv,
};

// GET /api/search?q=dune&type=all|movie|tv
searchRouter.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || 'all');
  if (!q) return res.status(400).json({ error: 'Query param "q" is required' });
  if (q.length > MAX_QUERY_LENGTH) {
    return res.status(400).json({ error: `Query must be ${MAX_QUERY_LENGTH} characters or fewer` });
  }

  const typesToSearch = type === 'all' ? Object.keys(SEARCHERS) : [type];
  if (!typesToSearch.every((t) => Object.hasOwn(SEARCHERS, t))) {
    return res.status(400).json({ error: `Unknown type "${type}"` });
  }

  const { results, errors } = await searchAcross(typesToSearch, (t) => SEARCHERS[t](q));

  res.json({ results, errors });
});
