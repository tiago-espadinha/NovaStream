# Project Brief

## Product in one sentence
Nova Stream is a media discovery app for finding movies, TV shows, books, games, and music in one place, helping users decide what to watch, read, play, or listen to without bouncing between multiple platforms.

## Audience and context
- Primary user: Entertainment-focused users who browse across multiple media types and want a single, low-friction discovery surface.
- Context of use: Casual browsing at home, on a laptop or desktop, before deciding what to consume next.
- User's current alternative/workaround: Jumping between app-specific discovery tools such as streaming libraries, Goodreads, Steam, Spotify, and search engines.
- Main pain point: Results are fragmented across services, and there is no single place to compare titles and save favorites across categories.

## Outcomes
- User outcome: Discover relevant media quickly, open details, and save items they want to revisit.
- Product/business outcome: Establish a reusable multi-source discovery pattern and a foundation for richer personalization features later.
- How success will be judged: Users can complete the core search → detail → save flow without confusion, and the app works with either mock data or live provider data during local development.

## Core user journeys
1. Trigger → user searches across media types or browses by category. They filter results, open a title detail page, and decide whether to save it or continue exploring.
2. Trigger → user signs in, saves media, and later sees their saved items in a personal list associated with their account.

## Functional requirements
- [ ] Must-have: search and type-based browsing across movies, TV, books, games, and music; media detail view with synopsis, metadata, and provider/source info; save/favorite flow with guest and signed-in states; live API integration, plus a separate mock mode that runs without the API.
- [ ] Should-have: filter controls, responsive layout, watchlist strip, account login/register flow, persisted saved list per user.
  - Open question: the watchlist strip was dropped in the After Hours redesign; built-in collections (To Watch, To Read, …) now cover that need. Confirm the requirement can be retired.
- [ ] Later / out of scope: advanced recommendation engine, social features, rate limiting beyond password attempts, database migration, long-term personalized history/recently viewed tracking.

## Constraints
- Required stack or integrations: React + TypeScript + Vite frontend; Express API server; TMDb (films, TV), RAWG (games), Open Library (books), Last.fm (music), and Deezer (artist photos and release years for music); JWT-based auth with bcrypt hashing.
- Data/privacy/security constraints: user accounts store a minimal profile and saved media list; secrets stay in environment files and are never committed; API access is protected by server-side auth checks and local storage token handling on the client.
- Accessibility requirements: semantic structure, keyboard focus states, readable contrast, meaningful labels, and responsive behavior across common viewport sizes.
- Deadline or scope constraints: MVP is a local-development prototype rather than a production-grade consumer product; scope should stay limited to core discovery and saved-item workflows.
- Deployment target: local dev and static frontend hosting with a separate API process; production deployment is not assumed in the current scope.

## Existing prototype
- Location: Project root for the frontend and `/server` for the API.
- What works: search UI, type navigation, media cards, detail view, login/register modal, and a saved-media flow; mock mode still works without the API; live data mode connects to the backend for real provider results.
- What is mocked: mock mode (`VITE_USE_MOCK=true`, the default) uses a bundled dataset for search, detail, and the trending shelf, so the app runs without the API; live mode never falls back to it.
- Assets/components to preserve: the approved After Hours direction (`docs/DESIGN_DIRECTION.md`) replaced the original visual system and animated background; preserve its tokens, spotlight, shelves, and card patterns.
- Known limitations: provider metadata varies in depth (Open Library and Last.fm especially), JWT auth is local-first, the database is a single JSON file, and only password attempts are rate-limited. The full list is in the README.

## Open questions and assumptions
| Question/assumption | Impact | How to resolve |
|---|---|---|
| The app is intentionally local-first and prototype-focused. | Keeps scope manageable and avoids overbuilding infrastructure. | Keep validation and UX focused on MVP discovery flows and deferred production features. |
| Live provider data is optional for local usage. | Allows offline/demo flows and lowers setup friction. | Maintain `VITE_USE_MOCK` toggling and document backend env setup clearly. |
| User data should remain lightweight for now. | Keeps architecture simple and secure enough for a prototype. | Use JSON-file storage with a single access layer and isolate DB changes behind `/server/src/db/store.js`. |
| The app should support multiple media types from the start. | Drives shared normalization and API abstraction work. | Keep one common result schema across providers and type-specific detail rendering. |

## Definition of MVP
A user can open the app, search or browse entertainment by type, compare results across multiple media categories, open a detail view for a chosen title, and save it to a personal list after signing in. The app should work in both mock mode and live API mode, and it should feel coherent and usable on a desktop-first layout while still remaining responsive enough for smaller screens.
