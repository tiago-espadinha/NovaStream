import { Router } from 'express';
import { getTrending } from '../services/trending.js';
import { parseLang } from '../utils/lang.js';

export const trendingRouter = Router();

// GET /api/trending — same { results, errors } contract as search.
trendingRouter.get('/', async (req, res) => {
  res.json(await getTrending(parseLang(req.query.lang)));
});
