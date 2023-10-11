// Request bodies are untrusted: each parser keeps only known fields, checks their types and
// sizes, and returns either { value } or { error } with copy that is safe to show users.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const MAX_NAME = 60;
const MIN_PASSWORD = 8;
// bcrypt ignores bytes past 72, so longer passwords would silently match on a prefix.
const MAX_PASSWORD = 72;

const isString = (value) => typeof value === 'string';
const stringList = (value, maxItems, maxLength) =>
  Array.isArray(value)
    ? value.filter((entry) => isString(entry) && entry.length <= maxLength).slice(0, maxItems)
    : [];

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

  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  if (new TextEncoder().encode(password).length > MAX_PASSWORD) {
    return { error: `Password must be at most ${MAX_PASSWORD} characters.` };
  }
  if (name !== undefined && name !== null && !isString(name)) return { error: 'Name must be text.' };
  const trimmedName = (name || '').trim();
  if (trimmedName.length > MAX_NAME) return { error: `Name must be at most ${MAX_NAME} characters.` };
  return { value: { email: normalizedEmail, password, name: trimmedName || normalizedEmail.split('@')[0] } };
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
