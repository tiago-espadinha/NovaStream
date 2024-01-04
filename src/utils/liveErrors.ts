import i18n from '../i18n';
import { ApiError, type ProviderErrorCode, type SearchError } from '../services/apiService';
import { CONTENT_TYPE_LABELS } from '../types';

export interface LiveProblem {
  message: string;
  /** False when trying again can't help (bad input, or a source the server isn't configured for). */
  retryable: boolean;
}

function listTypes(errors: SearchError[]): string {
  const names = errors.map((error) => CONTENT_TYPE_LABELS[error.type]);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(i18n.t('common.listComma'))}${i18n.t('common.listAnd')}${names[names.length - 1]}`;
}

function sharedCode(errors: SearchError[]): ProviderErrorCode | null {
  return errors.every((error) => error.code === errors[0].code) ? errors[0].code : null;
}

/**
 * User-facing copy for provider failures in a live search, or null when every source answered.
 * `searchedTypes` is how many media types were queried, to tell a partial outage from a full one.
 */
export function describeSearchErrors(
  errors: SearchError[],
  resultCount: number,
  searchedTypes: number,
): LiveProblem | null {
  if (errors.length === 0) return null;
  const code = sharedCode(errors);
  const retryable = code !== 'not_configured';

  if (errors.length >= searchedTypes) {
    if (code === 'not_configured') return { message: i18n.t('liveErrors.search.notConfigured'), retryable };
    if (code === 'timeout') {
      return { message: i18n.t('liveErrors.search.timeout'), retryable };
    }
    return { message: i18n.t('liveErrors.search.unreachable'), retryable };
  }

  const reason = code === 'timeout' ? 'timeout' : code === 'not_configured' ? 'notConfigured' : 'unreachable';
  const types = listTypes(errors);
  const message =
    resultCount > 0
      ? i18n.t(`liveErrors.search.partial.${reason}`, { types })
      : i18n.t(`liveErrors.search.partialEmpty.${reason}`, { types });
  return { message, retryable };
}

/**
 * Copy for provider failures in the Home trending shelf, or null when every source answered.
 * With nothing to show it reads as a failure; otherwise it names what's missing.
 */
export function describeTrendingErrors(errors: SearchError[], resultCount: number): LiveProblem | null {
  if (errors.length === 0) return null;
  const code = sharedCode(errors);
  const retryable = code !== 'not_configured';

  if (resultCount === 0) {
    if (code === 'not_configured') return { message: i18n.t('liveErrors.trending.notConfigured'), retryable };
    if (code === 'timeout') return { message: i18n.t('liveErrors.trending.timeout'), retryable };
    return { message: i18n.t('liveErrors.trending.unreachable'), retryable };
  }

  // A source the server has no key for is a permanent deployment gap, not something a visitor
  // can act on, so it stays in the server log rather than warning on every visit.
  const transient = errors.filter((error) => error.code !== 'not_configured');
  if (transient.length === 0) return null;
  const key = sharedCode(transient) === 'timeout' ? 'partialTimeout' : 'partialUnreachable';
  return { message: i18n.t(`liveErrors.trending.${key}`, { types: listTypes(transient) }), retryable: true };
}

/** Copy for a search request that failed outright (network down, backend not running, bad input). */
export function describeSearchFailure(error: unknown): LiveProblem {
  // 400s carry the server's validation message, which is written for users.
  if (error instanceof ApiError && error.status === 400) return { message: error.message, retryable: false };
  return { message: i18n.t('liveErrors.search.failed'), retryable: true };
}

export function describeDetailError(error: unknown): LiveProblem {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === 'not_found') return { message: i18n.t('liveErrors.detail.notFound'), retryable: false };
  if (code === 'not_configured') return { message: i18n.t('liveErrors.detail.notConfigured'), retryable: false };
  if (code === 'timeout') return { message: i18n.t('liveErrors.detail.timeout'), retryable: true };
  return { message: i18n.t('liveErrors.detail.failed'), retryable: true };
}

export function describeSeasonError(error: unknown): LiveProblem {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === 'not_found') return { message: i18n.t('liveErrors.season.notFound'), retryable: false };
  if (code === 'not_configured') return { message: i18n.t('liveErrors.season.notConfigured'), retryable: false };
  if (error instanceof ApiError && error.status === 400) return { message: error.message, retryable: false };
  if (code === 'timeout') return { message: i18n.t('liveErrors.season.timeout'), retryable: true };
  return { message: i18n.t('liveErrors.season.failed'), retryable: true };
}

export function describeAlbumsError(error: unknown): LiveProblem {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === 'not_configured') return { message: i18n.t('liveErrors.albums.notConfigured'), retryable: false };
  if (code === 'timeout') return { message: i18n.t('liveErrors.albums.timeout'), retryable: true };
  return { message: i18n.t('liveErrors.albums.failed'), retryable: true };
}
