# Deployment

The app runs on Vercel's free tier. `vercel.json` builds the frontend into `dist/` and serves the
API as one serverless function (`api/index.js`, the same Express app) on the same origin, so CORS
isn't involved. Vercel's filesystem doesn't keep writes, so accounts need Upstash Redis.

## Configuration

Set these for Production and Preview. [Architecture](ARCHITECTURE.md#configuration) describes each one.

| Variable                                             | Value                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `VITE_USE_MOCK`                                      | `false`                                                                                         |
| `VITE_API_BASE_URL`                                  | `/api`                                                                                          |
| `JWT_SECRET`                                         | A newly generated secret, see below                                                             |
| `JWT_EXPIRES_IN`                                     | Optional; defaults to `7d`                                                                      |
| `TMDB_API_KEY`, `RAWG_API_KEY`, `LASTFM_API_KEY`     | Provider keys                                                                                   |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Added by the Upstash integration, which may name them `KV_REST_API_URL` and `KV_REST_API_TOKEN` |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Changing `JWT_SECRET` signs everyone out.

## First deploy

1. Import the repository into a new Vercel project on the Hobby plan. Keep the root directory and
   the settings `vercel.json` provides.
2. In the project, open **Storage → Upstash for Redis → Free** and connect it.
3. Add the remaining variables above.
4. Deploy, then check that `https://<your-app>.vercel.app/api/health` returns `{"ok":true}`.

Accounts in a local `data.json` aren't copied to Redis.

## Before a release

```bash
npx tsc -b
npm run lint
npm run format:check
npm test
npm run build
```

There is no CI, so these run by hand. Vercel preview deployments serve as staging.

## After a release

- Check `/api/health`, then run a search and open a title on the production URL.
- A new service worker activates at once and reloads open pages into the new build.
- The trending cache lives in each function instance, so a cold start refetches it.

## Other hosts

- **Storage:** without Redis, accounts go to `server/src/db/data.json`, which suits a single process
  on a disk that persists.
- **Origins:** if the frontend and API are on different origins, set `CORS_ORIGIN` to the frontend's
  exact origin. The API accepts only one.
- **Client IPs:** `x-forwarded-for` is trusted only on Vercel. Behind another proxy every visitor
  shares the proxy's address, so per-IP limits apply to all of them together.
- **Logging:** set `NODE_ENV=production` to turn off request and response logging.
