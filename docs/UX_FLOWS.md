# UX Flows and Screen Inventory

## Primary journey: discover and save
1. Open Home/Search with the featured spotlight, cross-media shelves, search, and type navigation.
2. Search a title or browse a media type; optionally refine by existing genre/rating/play-count filters and sort order.
3. Receive loading feedback, then results or an explanatory empty/provider-error state with a recovery action.
4. Open a title's detail overlay to review synopsis, metadata, and provider/source information.
5. Save the title; guests receive a clear sign-in/persistence explanation while signed-in users can save and assign collections.
6. Revisit saved titles and collections from the Saved page.

## Secondary journeys
- Sign in or register from the account action, then return to discovery with saved-media access.
- Save/unsave as a guest or signed-in user without losing clear state feedback.
- Create, select, assign, and delete collections from the existing collection surfaces.
- Use filters to narrow by media type, genre, rating, or play count where applicable.
- Use mock mode without a backend or live mode with the existing provider-backed API.

## Screen inventory
| Screen / route | User goal | Primary action | Key states | Responsive notes |
|---|---|---|---|---|
| Home / search | Discover what to consume next | Search or browse a type/shelf | Loading, empty, results, partial provider error, retry | Spotlight stacks on narrow screens; labelled shelves scroll horizontally; search and type access stay prominent |
| Detail overlay | Decide whether a title is relevant | Review details and save | Loading, saved, auth-required, provider error | Full-width/near-full-screen on mobile; metadata reflows without hiding save/close |
| Saved page | Revisit titles and organize collections | Open title or manage collection | Loading, empty, populated, selected collection, operation error | Collections and controls stack or become a labelled horizontal selector; cards reflow |
| Auth modal | Sign in or register | Submit credentials | Loading, validation, auth error, too many attempts, success/close | Centered panel on desktop; near-full-width with safe-area spacing on mobile |
| Account settings modal | Manage the signed-in account | Change password, sign out, or delete the account | Validation, wrong password, too many attempts, saving, password changed, delete confirm step, deleting, account deleted, session ended | Opened from the account button in the header; same panel as the auth modal, scrolling within the viewport on mobile |

## Interactions
| Interaction | Expected behavior | Keyboard / a11y | Failure and recovery |
|---|---|---|---|
| Type selection | Switches the active media type/results while retaining access to all five types | Semantic buttons, selected state announced, visible focus | Empty state offers clear/reset path |
| Search input | Queries across supported types and debounces live requests | Persistent label, keyboard accessible, no placeholder-only label | Inline provider/network error and retry/refine guidance |
| Shelf navigation | Scrolls to more titles without trapping the page | Labelled region; focusable cards and controls; optional previous/next buttons | Scroll remains usable by touch, keyboard, and pointer |
| Result card/detail | Opens the existing detail overlay | Keyboard operable; card title/type exposed; save action separately focusable | Detail loading/error has close and recovery path |
| Save action | Toggles favorite and remains clear for guest/signed-in states | Button name/state announced; never color-only | Auth-required message or surfaced persistence error |
| Filter/sort | Applies current category, genre, rating, play-count, and sort logic | Labelled controls; dialog/drawer focus handling | Reset returns to broad results |
| Saved collections | Create/select/delete/assign without dropping saved items unexpectedly | Buttons and checkboxes have labels and focus | Empty/error guidance explains next action |
| Account settings | Changing the password keeps this device signed in and signs out the others; deleting the account needs the password in a separate confirm step, then signs out and confirms in a notice | Focus starts on the current password, stays in the dialog, and returns to the account button; Esc and Cancel dismiss without changes; errors are tied to their fields and never color-only | A wrong password keeps the form and the session; too many wrong passwords show how long to wait, also without ending the session; an ended session signs out with a notice; a failed request shows an error and changes nothing |

## Responsive notes
- Design and verify at 375px, 768px, and 1280px.
- No unintended page-level horizontal overflow; horizontal scroll is intentional only for labelled shelves or type navigation.
- Keep search, account, Saved, and type access reachable on mobile without obscuring the current task.
- Respect safe-area insets and ensure overlays fit the viewport.

## Empty, error, and no-permission content
- Empty search: “No matches for X” with a clear reset/refine path.
- Empty live search before a query: explain that a search is needed to query live databases.
- Empty saved list: explain how to save titles and how guest vs signed-in saving behaves.
- Auth required: explain what sign-in enables and provide a clear CTA.
- Provider failure: non-blocking message identifying partial failure when possible, with retry/refine guidance.
- Save/auth/collection failure: preserve visible state and surface an actionable error; never show false success.

## UX acceptance criteria
- [x] The primary discover → detail → save journey is defined.
- [x] Existing categories, filters, sorting, account, saved, and collection flows are retained.
- [x] Loading, empty, error, success, disabled, and validation states are represented in the inventory.
- [x] Responsive behavior is defined for the selected After Hours direction.
- [ ] Implemented flows retain the same functionality and data-mode behavior.
- [ ] Keyboard, focus, contrast, reduced-motion, and responsive checks pass on the implemented screens.
