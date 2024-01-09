# UX/UI Design Direction

Status: Approved
Tokens file: src/styles/tokens.css
Approved by: User

## Design thesis
Nova Stream should feel like an after-hours culture guide: atmospheric and cinematic, but still a practical cross-media discovery tool. A strong featured title sets the mood; compact metadata and browsable shelves make it easy to move between films, series, music, books, and games.

## Fit
The audience browses casually before deciding what to watch, read, play, or hear. A streaming-inspired spotlight gives a title emotional weight, while shared category navigation and cross-media shelves retain the product's defining breadth. Search, filters, sorting, detail, favorites, collections, authentication, and mock/live data behavior remain available.

## Choice and alternatives
- Chosen: After Hours / immersive, shelf-based discovery.
- Alternatives explored:
  - Cinema Wall: dark editorial spotlight above a cross-media poster grid; the closest continuation of the existing card wall.
  - Culture Index: light print-editorial catalog with a format/filter rail and structured grid.
- Why After Hours was selected:
  - It establishes a distinctive entertainment mood without hiding cross-media discovery.
  - The oversized featured-title treatment gives the primary item a clear hierarchy.
  - Horizontal shelves preserve familiar media browsing while supporting title comparison.
- Trade-offs:
  - Shelves show fewer items at once than a grid and can make scanning less direct.
  - The atmospheric treatment must not reduce text contrast or overwhelm real artwork.
  - Search, filters, sort, save, and all categories must remain visible and usable rather than being sacrificed for a streaming-only feel.

## Weaknesses to address; behavior to preserve
- Address the current header's competing controls, text-only hero pushing results down, decorative glow competing with content, and gradient-only mock covers.
- Preserve all five media types, search and category browsing, filters and sorting, detail metadata and provider information, guest and signed-in save behavior, collections, Saved page, auth modal, and mock/live data mode.
- Use existing content artwork when present. Generated or gradient artwork may remain a clearly secondary fallback, not the default visual treatment.

## References
- [Shopify Editions on Mobbin](https://mobbin.com/sites/shopify-editions-9e30e61f-2e6b-463f-827b-71f7d6ba7c2e/4a00a721-bc61-4e94-9d3f-6677f0d0614d/preview): the link redirected to Mobbin's own sparse, high-contrast marketing page. Its large type and whitespace informed hierarchy; the selected Shopify screen could not be assessed.
- [TMDb](https://www.themoviedb.org/?language=en-US): visible dark navigation, direct search, and a large welcome message make the discovery entry point obvious. Borrow the immediate search/category access, not its media-specific scope.
- [SlothUI library card](https://dribbble.com/shots/24478513-slothUI-World-s-Laziest-Design-System-TV-Movie-Library-Card) and [Flickz streaming landing page](https://dribbble.com/shots/24112289-Flickz-Movie-Streaming-Landing-Page-V1): Dribbble consent overlays obscured the referenced designs. Their titles suggested media-card and streaming-landing patterns, but their visual details were not treated as verified evidence.
- Product requirements: [PROJECT_BRIEF.md](./PROJECT_BRIEF.md), [UX_FLOWS.md](./UX_FLOWS.md), and the existing prototype in `src/`.

## Visual language
- Tone: after-hours, confident, atmospheric, entertainment-first.
- Typography:
  - Display: Barlow Condensed, with a system condensed sans-serif fallback.
  - Body and controls: DM Sans, with Inter and system sans-serif fallbacks.
  - Type scale: display 56–94px / 0.84–0.95 line height; H1 40–64px / 1.0; H2 23–30px / 1.15; H3 16–20px / 1.25; body 14–16px / 1.5; metadata 11–13px / 1.4.
  - Font asset delivery for the built app: TBD; the prototype must retain usable system fallbacks.
- Color roles:
  - Background: `#100D19`
  - Background-alt: `#171320`
  - Surface: `#1C1726`
  - Surface-strong: `#2A2031`
  - Text: `#FBF8F4`
  - Text-muted: `#C0B6C4`
  - Primary action/accent: `#FF668C` (pair with dark foreground `#1A0C15` for filled controls)
  - Secondary accent: `#FFCB79`
  - Success: `#72D6A5`
  - Danger: `#FF7185`
  - Border: `rgba(251, 248, 244, 0.16)`
- Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px.
- Shape: 6px controls, 9px media cards, 18px feature/panel surfaces, pill-shaped navigation where appropriate; 1px borders.
- Elevation: low `0 8px 24px rgba(0, 0, 0, 0.24)`; high `0 22px 54px rgba(0, 0, 0, 0.42)`.
- Imagery: real posters, covers, thumbnails, and album art lead. Atmospheric color fields support the spotlight but remain behind readable content.
- Voice: concise, confident, and genre-aware; metadata stays scannable.

## Signature element
The “featured after dark” spotlight: a wide, atmospheric title feature with an oversized condensed title, type/genre, year/rating, synopsis, and clear explore/save actions. It leads into a horizontal shelf that mixes the five media formats.

## Motion
- Short opacity/transform transitions, normally 120–180ms; no parallax, autoplay, or flashing emphasis.
- Respect `prefers-reduced-motion: reduce` by removing non-essential transitions.
- Save feedback may use a brief color/fill change; it must not rely on motion alone.

## Components and patterns
| Component | Purpose | Rules and states |
|---|---|---|
| Header | Discovery entry point | Compact brand, search, type navigation, Saved, and account action; sticky only where it does not consume mobile space |
| Featured spotlight | Set a clear first choice | Large title and artwork with concise metadata, synopsis, Explore, and Save |
| Cross-media shelf | Browse and compare | Horizontal scroll with visible affordance; cards identify format, title, and rating without hover-only information |
| Filters and sort | Refine results | Keep all existing genre/rating/play-count and sort behaviors reachable; use a compact panel or drawer on narrow screens |
| Detail overlay | Decide and save | Preserve synopsis, metadata, sources/providers, collections, and clear close/save actions |
| Saved page | Revisit saved media | Retain collection selection/actions, empty state, and a responsive grid/list |
| Auth modal | Sign in/register | Preserve validation, loading, and error states with visible labels and focus |

## Responsive behavior
- 375px: compact header; search remains easy to reach; type choices wrap or scroll with an explicit affordance; spotlight stacks title and art; shelves scroll horizontally; filters use a labelled drawer/collapsible panel.
- 768px: balanced feature composition where space permits; two-column saved/results layouts; shelf cards remain large enough to scan and operate.
- 1280px: wide feature spotlight, visible search and full type navigation, horizontal shelves with several cards in view, and optional persistent filters only when they do not crowd discovery.
- Avoid page-level horizontal overflow; horizontal scrolling is limited to labelled shelves/navigation with keyboard-operable controls.

## Accessibility and states
- Use semantic headings, labelled search and controls, real buttons/links, and meaningful artwork alternatives.
- Every action is keyboard reachable with a visible focus indicator; card details and save controls do not depend on hover.
- Verify text, muted text, primary/secondary actions, disabled states, and focus indicators meet WCAG AA contrast on their actual surfaces before implementation is accepted.
- Keep loading, empty, provider error/retry, save success, disabled, validation, and auth-required states clear and consistent with [UX_FLOWS.md](./UX_FLOWS.md).
- Support reduced motion and avoid color-only status communication.

## Visual acceptance criteria
- [ ] Search, all five types, filter/sort, save, and account entry remain easy to find.
- [ ] The spotlight creates a clear first choice without obscuring search or results.
- [ ] Cross-media shelves identify type, title, and useful metadata without hover.
- [ ] Layout is checked at 375, 768, and 1280px with no unintended horizontal overflow.
- [ ] Contrast, keyboard/focus, reduced motion, and meaningful labels are verified in the implemented screens.
- [ ] Existing core flows and mock/live behavior remain intact.
