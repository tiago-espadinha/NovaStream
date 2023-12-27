// Request bodies are untrusted: each parser keeps only known fields, checks their types and
// sizes, and returns either { value } or { error } with copy that is safe to show users.

export const MEDIA_TYPES = ['movie', 'tv', 'music', 'book', 'game'];
export const MAX_SAVED_MEDIA = 500;
const MUSIC_KINDS = ['artist', 'album', 'song'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const MAX_NAME = 60;
const MIN_PASSWORD = 8;
// bcrypt ignores bytes past 72, so longer passwords would silently match on a prefix.
const MAX_PASSWORD = 72;

const isString = (value) => typeof value === 'string';
const shortString = (value, max) => (isString(value) && value.length <= max ? value : undefined);
const stringList = (value, maxItems, maxLength) =>
  Array.isArray(value)
    ? value.filter((entry) => isString(entry) && entry.length <= maxLength).slice(0, maxItems)
    : [];
const finiteOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** The rule for any password a user picks, at registration or when changing it. */
function newPasswordError(password) {
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD) {
    return `Password must be at most ${MAX_PASSWORD} characters.`;
  }
  return null;
}

export function parseCredentials(body, { register = false } = {}) {
  const { email, password, name } = body || {};
  if (!isString(email) || !isString(password) || !email.trim() || !password) {
    return { error: 'Email and password are required.' };
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length > MAX_EMAIL || !EMAIL_PATTERN.test(normalizedEmail)) {
    return { error: 'Enter a valid email address.' };
  }
  if (!register) return { value: { email: normalizedEmail, password } };

  const passwordError = newPasswordError(password);
  if (passwordError) return { error: passwordError };
  if (name !== undefined && name !== null && !isString(name)) return { error: 'Name must be text.' };
  const trimmedName = (name || '').trim();
  if (trimmedName.length > MAX_NAME) return { error: `Name must be at most ${MAX_NAME} characters.` };
  return { value: { email: normalizedEmail, password, name: trimmedName || normalizedEmail.split('@')[0] } };
}

export function parsePasswordChange(body) {
  const { currentPassword, newPassword } = body || {};
  if (!isString(currentPassword) || !isString(newPassword) || !currentPassword || !newPassword) {
    return { error: 'Enter your current password and a new one.' };
  }
  const passwordError = newPasswordError(newPassword);
  if (passwordError) return { error: passwordError };
  if (newPassword === currentPassword) return { error: 'Choose a password different from your current one.' };
  return { value: { currentPassword, newPassword } };
}

/** A saved-media snapshot: just what a card needs to render, never a full detail payload. */
export function parseMediaSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'A title to save is required.' };
  const id = shortString(raw.id, 300);
  const title = shortString(raw.title, 300);
  if (!id || !title || !MEDIA_TYPES.includes(raw.type)) {
    return { error: 'A saved title needs an id, a title, and a known type.' };
  }
  const media = {
    id,
    title,
    type: raw.type,
    rating: finiteOrNull(raw.rating),
    genres: stringList(raw.genres, 10, 60),
    tags: stringList(raw.tags, 10, 60),
    releaseYear: finiteOrNull(raw.releaseYear),
    posterUrl: isString(raw.posterUrl) && /^https:\/\//.test(raw.posterUrl) ? raw.posterUrl.slice(0, 1000) : null,
  };
  for (const field of ['gradientFrom', 'gradientTo']) {
    const value = shortString(raw[field], 40);
    if (value) media[field] = value;
  }
  const artist = shortString(raw.artist, 300);
  if (artist) media.artist = artist;
  if (MUSIC_KINDS.includes(raw.musicKind)) media.musicKind = raw.musicKind;
  const listeners = shortString(raw.playStats?.listeners, 40);
  const playcount = shortString(raw.playStats?.playcount, 40);
  if (listeners && playcount) media.playStats = { listeners, playcount };
  return { value: media };
}

export function parsePreferences(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Preferences must be an object.' };
  const patch = {};
  if ('favoriteGenres' in body) {
    if (!Array.isArray(body.favoriteGenres)) return { error: 'favoriteGenres must be a list.' };
    patch.favoriteGenres = stringList(body.favoriteGenres, 50, 60);
  }
  if ('theme' in body) {
    if (!['dark', 'light'].includes(body.theme)) return { error: 'theme must be "dark" or "light".' };
    patch.theme = body.theme;
  }
  return { value: patch };
}

// Mirrors BUILT_IN_COLLECTIONS in src/hooks/useCollections.ts; the server only needs the ids.
export const BUILT_IN_COLLECTION_IDS = [
  'to-watch', 'watched', 'to-read', 'read', 'to-listen', 'listened', 'to-play', 'playing', 'played',
];
export const MAX_CUSTOM_COLLECTIONS = 50;
const MAX_COLLECTION_NAME = 32;
const CUSTOM_ID_PATTERN = /^custom-[\w-]{1,80}$/;

function parseCustomCollections(raw) {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set();
  const seenNames = new Set();
  const custom = [];
  for (const entry of raw) {
    const name = isString(entry?.name) ? entry.name.trim() : '';
    const contentTypes = Array.isArray(entry?.contentTypes)
      ? [...new Set(entry.contentTypes.filter((type) => MEDIA_TYPES.includes(type)))]
      : [];
    const valid = isString(entry?.id) && CUSTOM_ID_PATTERN.test(entry.id) && name && name.length <= MAX_COLLECTION_NAME;
    if (!valid || !contentTypes.length || seenIds.has(entry.id) || seenNames.has(name.toLowerCase())) continue;
    seenIds.add(entry.id);
    seenNames.add(name.toLowerCase());
    custom.push({ id: entry.id, name, contentTypes });
    if (custom.length === MAX_CUSTOM_COLLECTIONS) break;
  }
  return custom;
}

/**
 * A user's whole collections document. Entries that don't fit are dropped rather than
 * rejected, so one stale item can't block saving everything else; an assignment is kept
 * only when it names known collections and comes with a valid snapshot of its title.
 */
export function parseCollections(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Collections must be an object.' };
  const custom = parseCustomCollections(body.custom);
  const knownIds = new Set([...BUILT_IN_COLLECTION_IDS, ...custom.map(({ id }) => id)]);
  const rawAssignments = body.assignments && typeof body.assignments === 'object' ? body.assignments : {};
  const rawMedia = body.media && typeof body.media === 'object' ? body.media : {};

  const assignments = {};
  const media = {};
  let kept = 0;
  for (const [itemId, ids] of Object.entries(rawAssignments)) {
    // Invalid entries are skipped first, so they never count toward the limit.
    const collectionIds = Array.isArray(ids) ? [...new Set(ids.filter((id) => knownIds.has(id)))] : [];
    const snapshot = parseMediaSnapshot(rawMedia[itemId]).value;
    if (!collectionIds.length || snapshot?.id !== itemId) continue;
    assignments[itemId] = collectionIds;
    media[itemId] = snapshot;
    kept += 1;
    if (kept === MAX_SAVED_MEDIA) break;
  }
  return { value: { custom, assignments, media } };
}
