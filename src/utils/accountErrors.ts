import i18n from '../i18n';
import { ApiError } from '../services/apiService';

/** The server answers 401 for every expired, invalid, or orphaned session. */
export function isSessionEnded(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export const pluralFavorites = (count: number) => `${count} ${count === 1 ? 'favorite' : 'favorites'}`;

/** One message for a guest-favorites merge, so a partial failure is never hidden behind a success. */
export function describeGuestMerge(added: number, notAdded: number): { message: string; error: boolean } | null {
  if (notAdded === 0) {
    return added > 0 ? { message: `Added ${pluralFavorites(added)} from this browser to your account.`, error: false } : null;
  }
  const kept = `${pluralFavorites(notAdded)} couldn’t be added yet and stay in this browser; they’ll be tried again next time.`;
  return { message: added > 0 ? `Added ${pluralFavorites(added)} to your account. ${kept}` : kept, error: true };
}

/**
 * User-facing copy for a failed account request. The server writes its 4xx messages for
 * users (validation, wrong password, duplicate email, list limits); everything else gets
 * generic copy so raw network or server text never reaches the UI.
 */
export function describeAccountError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return i18n.t('errors.offline');
  if (error.code === 'not_configured') return i18n.t('errors.notConfigured');
  // Coded errors are worded from the catalog; the server's English is only a fallback for other 4xx.
  if (error.code === 'rate_limited') {
    const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60));
    return i18n.t('errors.rateLimited', { count: minutes });
  }
  if (error.code === 'wrong_password') return i18n.t('errors.wrongPassword');
  if (error.status >= 400 && error.status < 500) return error.message;
  return fallback;
}
