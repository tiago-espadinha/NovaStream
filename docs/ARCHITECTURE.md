# Architecture

A React single-page app talks to an Express API, which proxies five free metadata providers and
stores accounts in Upstash Redis or a local JSON file. Provider keys stay on the server. The frontend
can also run alone in mock mode from a bundled dataset. On Vercel, both parts share one origin.

## Stack and runtime

- Language and framework: React 18 + TypeScript (Vite 8) frontend; Express 4 server (Node ESM).
- Runtime and version: Node 22 or newer (the server's `node --test` glob pattern needs Node 21+, and Node 18 and 20 are end-of-life); developed on v26.
- Package manager: npm, with a separate `package.json` in the root and in `server/`.
- Entry points: `src/main.tsx` (frontend) and `server/src/app.js` (API), served by `server/src/index.js` locally and by `api/index.js` on Vercel.

```text
src/                    frontend
├── components/         shared UI, one folder each: Header/, Shelf/, ContentCard/, SiteFooter/, …
├── screens/            home/, detail/, saved/, account/: what one area of the app shows
├── context/            AuthContext (session and token) and useAuth
├── hooks/              useLiveSearch, useContentFilters, useDetailNavigation, useHomeShelves,
│                       useAccountNotices, useFavorites, useCollections, useTrending, useDialog
├── i18n/               typed catalogs (locales/), language detection and setup
├── services/           apiService.ts, the only module that calls the API
├── data/               mockData.ts (mock mode), credits.ts (footer)
├── styles/             index.css (layer order), tokens.css, base.css, primitives.css; the rest sits beside its component
├── utils/              filtering, discovery shelves, collections, error copy
└── App.tsx, config.ts, types.ts, pwa.ts

server/src/
├── routes/             search, trending, media, auth, saved, collections
├── services/           tmdb, rawg, lastfm, deezer, openLibrary, trending, searchAcross, normalize, providerError
├── middleware/         auth (JWT)
├── db/                 store.js (Redis or JSON file), attempts.js (attempt counters)
├── utils/              validate, password, passwordAttempts, signUpAttempts, lang, asyncRoute
├── app.js              the Express app
└── index.js            local server (listen)

api/index.js            Vercel function serving server/src/app.js
```

## Boundaries

- Frontend: `src/services/apiService.ts` is the only module that calls the API.
- API: `server/src/routes/*` under `/api`.
- External services, server-side only: TMDb (movies, TV), Open Library (books), RAWG (games), Last.fm (music) and Deezer (artist photos and release years).

## Data and state

### Stores

`server/src/db/store.js` holds users, their saved media and their collections behind an async API. Guest favorites and collections live in browser `localStorage`.

With `UPSTASH_REDIS_REST_URL`/`_TOKEN` (or `KV_REST_API_URL`/`_TOKEN`) set, it uses Upstash Redis over its REST API:

- `user:<id>` holds the user JSON.
- `user-auth:<id>` holds the password hash and session version. Data writes (saved media, collections, preferences) never write this key, so one that read the user before a password change can't restore the old password. Records from before this key keep their auth fields inline until their next data write moves them.
- `user-email:<lowercased email>` maps to the id and is claimed with `SET NX`, so duplicate registrations fail atomically.

A deletion racing a write cleans up the auth key it may recreate. Only a network failure at that exact point can leave one behind, and reads ignore it without the record.

Otherwise it uses a JSON file (`server/src/db/data.json`, git-ignored).

### Attempt counters

`server/src/db/attempts.js` counts attempts under `pw-attempts:account:<lowercased email>` and `pw-attempts:ip:<ip>` in the same Redis, or in an in-memory map without Redis. Sign-ups are counted the same way, per IP.

Each attempt is counted before its password is checked, with `INCR`, `EXPIRE NX` and `TTL` in one `/multi-exec` transaction, so parallel guesses can't pass the limit and the window runs from the first attempt. A correct password deletes the account key and `DECR`s the IP key. A sign-in for an unknown email still runs one bcrypt compare, against a fixed dummy hash at the same cost, so response time doesn't reveal which emails have accounts.

### Entities and ownership

- A user record owns `savedMedia` (card snapshots, at most 500) and `collections` (`{ custom, assignments, media }`: custom collections, which titles are in which collection, and a card snapshot per assigned title).
- Built-in collection ids are defined in `src/utils/collections.ts` and mirrored on the server for validation.
- Guest to account: on sign-in, guest favorites are uploaded and removed from the browser once the server accepts them. Guest collections are merged into the account's (same-named collections combine; within an exclusive group the account's choice wins) and cleared after the merged document saves.
- Migrations: none. Records written before collections were added have no `collections` field and read as empty.

## APIs and integrations

All routes are under `/api`.

| Route or integration                        | Purpose                                                                                                                                    | Auth and validation                                                                                                                                                                                                                                                   | Failure behavior                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                               | Liveness check                                                                                                                             | Public                                                                                                                                                                                                                                                                | None                                                                                                                                                                                                                                                                              |
| `GET /search?q&type&musicKind&lang`         | Cross-media search                                                                                                                         | Public. `q` required, ≤200 chars; `type` and `musicKind` must be known values (400 otherwise, with a user-readable message)                                                                                                                                           | Each media type is searched in parallel with an 8s timeout. Failures don't fail the request: the response is `{ results, errors: [{ type, code }] }` with `code` in `not_configured`, `not_found`, `timeout`, `unavailable`. Raw provider messages are logged on the server only. |
| `GET /trending?lang`                        | Home "Trending this week" shelf                                                                                                            | Public                                                                                                                                                                                                                                                                | Same `{ results, errors }` contract and 8s per-type timeout as search.                                                                                                                                                                                                            |
| `GET /media/:type/:id?lang`                 | Title detail                                                                                                                               | Public. Unknown `type` → 400                                                                                                                                                                                                                                          | Same codes as search, mapped to 404 (`not_found`), 504 (`timeout`), 503 (`not_configured`), 502 (`unavailable`); body `{ error, code }` with client-safe copy. 8s timeout.                                                                                                        |
| `GET /media/tv/:id/season/:season?lang`     | One season's episodes (number, title, air date), fetched only when picked. Series detail lists `seasons` (regular in order, specials last) | Public. `id` must be 1–10 digits and `season` 0–999 without leading zeros (400 otherwise, before TMDb is called)                                                                                                                                                      | Same codes and copy as title detail (404 for a season TMDb doesn't have). 8s timeout.                                                                                                                                                                                             |
| `GET /media/music/:id/albums`               | An artist's top albums, fetched after the artist detail opens                                                                              | Public                                                                                                                                                                                                                                                                | Same codes and copy as title detail. 8s timeout.                                                                                                                                                                                                                                  |
| `/auth/*`                                   | Register, login, current user, preferences, password change, account deletion                                                              | Register and login are public; `me`, `preferences`, `password` and `account` need a bearer JWT (HS256, `JWT_EXPIRES_IN`, default 7d). Bodies are parsed into known fields: email format, 8–72-character password, name ≤60, preferences `favoriteGenres`/`theme` only | See below                                                                                                                                                                                                                                                                         |
| `/saved`                                    | A user's favorites                                                                                                                         | Bearer JWT. Snapshots keep card fields only (https artwork); 500-item cap                                                                                                                                                                                             | 400 invalid snapshot, 409 list full, 401 session ended, 503 `not_configured`                                                                                                                                                                                                      |
| `GET`/`PUT /collections`                    | A user's collections document                                                                                                              | Bearer JWT. PUT replaces the whole document (last write wins); unknown collection ids, invalid snapshots and assignments without a snapshot are dropped, not rejected. 1mb body limit                                                                                 | 400 non-object body, 401 session ended, 503 `not_configured`                                                                                                                                                                                                                      |
| Provider services (`server/src/services/*`) | Normalize provider data to the shared media shape                                                                                          | API keys from server env                                                                                                                                                                                                                                              | Throw `ProviderError` with one of the codes above; a missing key is `not_configured`.                                                                                                                                                                                             |

Auth failures:

- 400 with a user-readable message for invalid input.
- 401 for a wrong sign-in password, or any invalid, expired or orphaned session.
- 403 `wrong_password` for a wrong current password on `password` and `account`.
- 409 `email_taken` for a duplicate email. Because that reveals an account exists, every well-formed sign-up (new or taken email) counts against 10 per IP an hour.
- 429 `rate_limited`, with `Retry-After` and `retryAfterSeconds`, beyond that sign-up limit or after 5 failed password attempts per account or 20 per IP in 15 minutes, before the password is checked. IPv6 counts per /64 block, and an IPv4-mapped address counts as its IPv4 address.
- 503 `not_configured` when `JWT_SECRET` is unset.

Timeouts stop the API from waiting on a slow provider; the provider's underlying request is not aborted.

## Provider caching

- Trending returns up to 4 items per type, each provider's own order interleaved by type, since popularity signals aren't comparable across providers. Each type's list is cached in memory for 6h (films and TV per language); concurrent requests share one fetch and failures aren't cached.
- Trending sources: TMDb `trending/{movie,tv}/week`, Last.fm `chart.gettoptracks`, RAWG `games` added in the last 30 days (no trending endpoint) and Open Library `trending/weekly.json` (undocumented; may change without notice).
- Deezer matches by normalised artist and title. A song's year is that of its matched track's album, fetched once per Deezer album id and shared with album cards. Each lookup is capped at 1s and cached in memory for 24h per instance, and requests beyond 40 per 5s are skipped, so a failure leaves the Last.fm data as it is and is retried on the next search.

## Localization

- UI copy lives in typed i18next catalogs (`src/i18n/locales/`, with English as the source). A missing key fails `tsc`, and tests check that every locale has the English keys and that components carry no literal copy.
- The language is the stored choice (`nova-stream:language` in `localStorage`), else the first browser language with a catalog, else English. `<html lang>` follows it.
- The API sends data, not English labels (`creatorRole`, a tagged `length`, null season and episode names), and the client words it.
- Media routes take `lang` (`en`, `pt-PT`, `es`, `fr`; anything else is English) and pass it to TMDb only. Genre names stay English so `genre:` search keeps matching, and an empty translated overview falls back to English. RAWG, Last.fm and Open Library answer in English.

## PWA

- `vite-plugin-pwa` (options in `src/pwa.ts`) emits `manifest.webmanifest` and a Workbox `sw.js` in production builds only; `src/main.tsx` registers it.
- The worker precaches the built shell and answers SPA navigations with `index.html`, except `/api/*`. There is no runtime caching, so API responses, fonts and artwork always hit the network.
- `autoUpdate` with `skipWaiting`/`clientsClaim` activates a new deploy's worker at once and reloads the page into it. `vercel.json` serves `sw.js` and the manifest with `Cache-Control: no-cache`.
- The PNG icons in `public/` are exports of `nova-stream.svg`: 192 and 512px as drawn, a maskable 512px with the artwork inside the safe zone, and a 180px full-bleed apple-touch icon. Re-export them whenever the SVG changes.

## Trust boundaries

- Request bodies and parameters are untrusted. `server/src/utils/validate.js` keeps only known fields, checks types and sizes, and returns copy that is safe to show users.
- Provider responses are untrusted. Services normalize them to the shared media shape, and snapshots keep https artwork only.
- Authorization is enforced on the server: JWT middleware checks the session version against the stored user, so a password change or deletion ends other sessions.
- Provider keys and `JWT_SECRET` stay in server env. Outside production, the API logs requests and responses to the console with credentials, tokens and API keys redacted.
- The API's CORS allows only `CORS_ORIGIN`.

## Configuration

The frontend reads the root `.env` and the API reads `server/.env`, each starting from its `.env.example`.

| Variable                                                                                       | Where  | Default                     | Purpose                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`                                                                            | root   | `http://localhost:4000/api` | API base URL                                                                                                                |
| `VITE_USE_MOCK`                                                                                | root   | `true`                      | `false` switches to live data                                                                                               |
| `PORT`                                                                                         | server | `4000`                      | API port                                                                                                                    |
| `CORS_ORIGIN`                                                                                  | server | `http://localhost:5173`     | The only browser origin the API accepts                                                                                     |
| `JWT_SECRET`                                                                                   | server | empty                       | Signs session tokens; accounts answer 503 until set                                                                         |
| `JWT_EXPIRES_IN`                                                                               | server | `7d`                        | Session length                                                                                                              |
| `PASSWORD_ATTEMPTS_PER_ACCOUNT`, `PASSWORD_ATTEMPTS_PER_IP`, `PASSWORD_ATTEMPT_WINDOW_SECONDS` | server | `5`, `20`, `900`            | Failed password attempts allowed before sign-in, password change and account deletion answer 429 for the rest of the window |
| `SIGNUP_ATTEMPTS_PER_IP`, `SIGNUP_ATTEMPT_WINDOW_SECONDS`                                      | server | `10`, `3600`                | Sign-ups allowed per IP before sign-up answers 429 for the rest of the window                                               |
| `TMDB_API_KEY`                                                                                 | server | empty                       | Films and TV                                                                                                                |
| `RAWG_API_KEY`                                                                                 | server | empty                       | Games                                                                                                                       |
| `LASTFM_API_KEY`                                                                               | server | empty                       | Music                                                                                                                       |
| `NODE_ENV`                                                                                     | server | unset                       | `production` turns off request and response logging                                                                         |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                           | server | empty                       | Store users in Upstash Redis instead of the JSON file. `KV_REST_API_URL`/`KV_REST_API_TOKEN` also work                      |

A provider without a key doesn't break anything: its type is reported as "not set up" while the others still return results.

| Provider                                               | Used for                                                                   | Key                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------- |
| [TMDb](https://www.themoviedb.org/settings/api)        | Films and TV: search, detail, watch providers, weekly trending             | Free, instant; attribution required            |
| [RAWG](https://rawg.io/apidocs)                        | Games: search, detail, platforms, recent additions                         | Free, 20k requests/month; attribution required |
| [Last.fm](https://www.last.fm/api/account/create)      | Music: albums, songs, artists, play counts, top-tracks chart               | Free; credit requested                         |
| [Deezer](https://developers.deezer.com/api)            | Music: artist photos (Last.fm only serves a placeholder) and release years | None needed                                    |
| [Open Library](https://openlibrary.org/developers/api) | Books: search, detail, weekly trending                                     | None needed                                    |

### Mock and live modes

- `VITE_USE_MOCK=true` uses the bundled dataset in `src/data/mockData.ts` and never calls the API for search, detail or trending. Saving as a guest works; signing in still needs the API.
- `VITE_USE_MOCK=false` always calls the API and never falls back to mock data. If the API is unreachable or a provider isn't configured, the UI explains the failure and offers a retry where one can help.

### Local development and production

- Local: `npm run dev` (port 5173) and `cd server && npm run dev` (port 4000).
- In live mode with `npm run preview`, set `CORS_ORIGIN=http://localhost:4173`.
- Production: see [Deployment](DEPLOYMENT.md).

### Troubleshooting

- **Still seeing sample titles after switching to live:** `VITE_USE_MOCK` must be exactly `false` in the root `.env`. Restart `npm run dev`; Vite reads `.env` at startup.
- **"Accounts aren't set up on the server yet":** `JWT_SECRET` is empty in `server/.env`.
- **A type says it isn't set up:** its provider key is missing in `server/.env`.
- **CORS errors in the browser:** `CORS_ORIGIN` must match the frontend's exact origin.
- **Testing from a phone:** run `npm run dev -- --host`, set `VITE_API_BASE_URL=http://<your-LAN-IP>:4000/api` in the root `.env` and `CORS_ORIGIN=http://<your-LAN-IP>:5173` in `server/.env`, and restart both.
- **Signed out unexpectedly:** sessions end after `JWT_EXPIRES_IN`, or when `JWT_SECRET` changes.

## Testing

- Unit and integration: Vitest for frontend utilities, the API client, i18n and the PWA config (`npx vitest run`, in `tests/`); `node --test` for server modules (`npm --prefix server test`, runs `server/tests/**/*.test.js`).
- Behaviour: every hook and every component that responds to the user is exercised with Testing Library in jsdom. Static components get a markup test. `tests/components/App.test.tsx` wires the real hooks and screens together, replacing only the network, for the riskiest flows: guest merge at sign-in, detail back navigation and sign-out closing settings.
- Coverage rule: `tests/design/test-coverage.test.ts` fails when a hook, component or screen has no test named after it, or when something interactive has only a markup test. See `tests/README.md`.
- End-to-end: none. Browser checks were ad hoc scripts, not committed.
- CI: none.
- What isn't automated: full user journeys in a real browser, layout and visual appearance, and screen-reader use. Accessibility was checked with ad hoc scripts for keyboard, focus, contrast and layout.

## Known limitations

- **Provider attribution:** RAWG's free tier requires a visible link wherever its data appears, TMDb's terms require its logo and a not-endorsed notice, and Last.fm asks for a credit. The footer links each provider but shows neither TMDb's logo nor its notice.
- **Deezer's terms:** they allow only non-commercial, "strictly private use within a family scope" and protect artist photos. This is a non-commercial portfolio project; wider or commercial use would need Deezer's approval or another source for photos and release years.
- **Rate limiting covers passwords and sign-ups only:** the public search, detail and trending routes spend provider quotas for anyone who can reach the API.
- **Sessions:** the JWT is kept in `localStorage`, readable by any script on the page, and can't be revoked individually before it expires, other than by a password change.
- **Storage:** a whole user record is rewritten on every change (last write wins), with no backups or migrations. The JSON file suits a single process only.
- **Providers:** Open Library's trending feed is undocumented and may change, and the trending cache is lost on restart.
- **Fonts** load from Google Fonts.
- **Mock mode** has only 2–3 titles per type, and its music titles have no kind, so the music-kind filter does nothing there.
