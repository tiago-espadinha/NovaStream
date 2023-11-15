import { Router } from 'express';
import { getTrending } from '../services/trending.js';

export const trendingRouter = Router();

// GET /api/trending — same { results, errors } contract as search.
trendingRouter.get('/', async (_req, res) => {
  res.json(await getTrending());
});
