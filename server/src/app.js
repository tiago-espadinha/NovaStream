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

export const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
// A collections document carries a card snapshot per assigned title, which outgrows the
// 100kb default; registered first so the general parser below skips these requests.
app.use('/api/collections', express.json({ limit: '1mb' }));
app.use(express.json());

const sensitiveField = /authorization|cookie|password|passwd|token|secret|api[-_]?key/i;
const maxLoggedResponseBytes = 64 * 1024;

function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        sensitiveField.test(key) ? '[REDACTED]' : redactSensitive(entry),
      ])
    );
  }
  return value;
}

function redactUrl(url) {
  const parsedUrl = new URL(url, 'http://localhost');
  for (const key of parsedUrl.searchParams.keys()) {
    if (sensitiveField.test(key)) parsedUrl.searchParams.set(key, '[REDACTED]');
  }
  return `${parsedUrl.pathname}${parsedUrl.search}`;
}

function formatResponseBody(chunks, truncated, contentType) {
  const body = Buffer.concat(chunks).toString('utf8');
  if (truncated) return `${body}\n...[truncated after ${maxLoggedResponseBytes} bytes]`;
  if (contentType?.includes('json')) {
    try {
      return redactSensitive(JSON.parse(body));
    } catch {
      return body;
    }
  }
  if (contentType?.startsWith('text/')) return body;
  return `[body omitted: ${contentType || 'non-text response'}]`;
}

app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') return next();

  const startedAt = Date.now();
  const responseChunks = [];
  let capturedBytes = 0;
  let truncated = false;

  const captureChunk = (chunk) => {
    if (chunk == null || truncated) return;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remainingBytes = maxLoggedResponseBytes - capturedBytes;
    responseChunks.push(buffer.subarray(0, remainingBytes));
    capturedBytes += Math.min(buffer.length, remainingBytes);
    truncated = buffer.length > remainingBytes;
  };

  const originalWrite = res.write;
  res.write = function (chunk, ...args) {
    captureChunk(chunk);
    return originalWrite.call(this, chunk, ...args);
  };

  const originalEnd = res.end;
  res.end = function (chunk, ...args) {
    captureChunk(chunk);
    return originalEnd.call(this, chunk, ...args);
  };

  res.on('finish', () => {
    console.log(`[API] ${req.method} ${redactUrl(req.originalUrl)} ${res.statusCode} ${Date.now() - startedAt}ms`);
    console.dir(
      {
        request: {
          headers: redactSensitive(req.headers),
          body: redactSensitive(req.body),
        },
        response: {
          headers: redactSensitive(res.getHeaders()),
          body: formatResponseBody(responseChunks, truncated, res.getHeader('content-type')),
        },
      },
      { depth: null }
    );
  });

  next();
});

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
