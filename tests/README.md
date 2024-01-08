# Tests

`npm test` runs the frontend tests in this folder with Vitest, then the API tests in `server/tests/` with Node's test
runner. It is the check to run before a commit.

## The rule

Every hook has a test in `hooks/`. Every component and screen, and `App`, has a test in `components/`. Each is named
after the file it covers and imports it. `design/test-coverage.test.ts` enforces this, so adding a file with no test
fails `npm test`.

- **Behaviour test:** every hook, and any component with a handler prop or a hook of its own beyond `useTranslation`.
  It renders with Testing Library in jsdom, and asserts what a person gets: roles, names, focus, stored data and the
  requests sent. Tests replace what lies outside the code under test: the network, and for hooks the session.
- **Markup test:** everything else, rendered to a string with `react-dom/server`. It asserts meaning, such as labels and
  hidden decoration, rather than a snapshot.

## `hooks/`

One file per hook in `src/hooks/`, using `renderHook`, or a small component for `useDialog`. `useFavorites` and
`useCollections` cover the guest merge at sign-in and saving in order; `useDetailNavigation` covers the trail behind
Back.

## `components/`

One file per shared component and screen. `App.test.tsx` runs the real hooks and screens together for the riskiest
flows: guest merge, sign-out closing settings, and detail back navigation.

## `context/`

The session held by `AuthProvider`: stored tokens, expiry, network failures and other tabs.

## `logic/`

Pure functions from `src/utils/`, the API client and the PWA config, on small inline fixtures.

## `i18n/`

The language catalogs and detection. `untranslated.test.ts` reads every component's source to catch copy that bypasses
the catalogs.

## `design/`

Rules that can be checked without a browser. `css-structure.test.ts` keeps the stylesheets in their layers, and
`test-coverage.test.ts` holds the rule above. These and `i18n/untranslated.test.ts` scan `src/`, which is why
`vite.config.ts` turns off Vitest's file cache: it would keep the list of files from an earlier run.

## `helpers/`

Shared code, not tests:

- `dom.ts`: import first in any test that renders into a document, below `// @vitest-environment jsdom`. Fills in what
  jsdom lacks and clears up between tests.
- `fixtures.ts`: titles to test with, and a promise settled by hand to hold a request open.
- `i18nSetup.ts`: pins Vitest to the English catalog.
- `css.ts`: reads the stylesheets.

## `server/tests/`

Mirrors `server/src/`, with `helpers/fakeUpstash.js` standing in for Redis. Run it alone with `npm --prefix server test`.

## What is not automated

Full user journeys in a real browser, layout and visual appearance, and screen-reader use.
