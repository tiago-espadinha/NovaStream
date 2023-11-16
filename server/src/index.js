import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { searchRouter } from './routes/search.js';
import { mediaRouter } from './routes/media.js';
import { authRouter } from './routes/auth.js';
import { savedRouter } from './routes/saved.js';
import { trendingRouter } from './routes/trending.js';
import { collectionsRouter } from './routes/collections.js';
import { requireAuthConfig } from './middleware/auth.js';

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
// A collections document carries a card snapshot per assigned title, which outgrows the
// 100kb default; registered first so the general parser below skips these requests.
app.use('/api/collections', express.json({ limit: '1mb' }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/search', searchRouter);
app.use('/api/trending', trendingRouter);
app.use('/api/media', mediaRouter);
app.use('/api/auth', requireAuthConfig, authRouter);
app.use('/api/saved', requireAuthConfig, savedRouter);
app.use('/api/collections', requireAuthConfig, collectionsRouter);

// Centralized error handler as a safety net for anything a route didn't catch itself.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 4000;
if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set: sign-in and saved media are disabled (see server/.env.example).');
}
app.listen(port, () => {
  console.log(`Nova Stream API listening on http://localhost:${port}`);
});
