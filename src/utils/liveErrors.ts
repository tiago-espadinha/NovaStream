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
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
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
    if (code === 'not_configured') return { message: 'Live search isn’t set up on the server yet.', retryable };
    if (code === 'timeout') {
      return { message: 'The live databases took too long to respond. Try again in a moment.', retryable };
    }
    return { message: 'The live databases couldn’t be reached. Try again in a moment.', retryable };
  }

  const what =
    code === 'timeout'
      ? 'didn’t respond in time'
      : code === 'not_configured'
        ? 'couldn’t be searched (not set up on the server)'
        : 'couldn’t be reached';
  const message =
    resultCount > 0
      ? `${listTypes(errors)} ${what} — showing results from the others.`
      : `${listTypes(errors)} ${what}, and nothing else matched.`;
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
    if (code === 'not_configured') return { message: 'Trending isn’t set up on the server yet.', retryable };
    if (code === 'timeout') return { message: 'Trending took too long to load. Try again in a moment.', retryable };
    return { message: 'Trending couldn’t be loaded right now.', retryable };
  }

  // A source the server has no key for is a permanent deployment gap, not something a visitor
  // can act on, so it stays in the server log rather than warning on every visit.
  const transient = errors.filter((error) => error.code !== 'not_configured');
  if (transient.length === 0) return null;
  const what = sharedCode(transient) === 'timeout' ? 'didn’t respond in time' : 'couldn’t be reached';
  return { message: `${listTypes(transient)} ${what} — showing what’s trending elsewhere.`, retryable: true };
}

/** Copy for a search request that failed outright (network down, backend not running, bad input). */
export function describeSearchFailure(error: unknown): LiveProblem {
  // 400s carry the server's validation message, which is written for users.
  if (error instanceof ApiError && error.status === 400) return { message: error.message, retryable: false };
  return { message: 'Couldn’t reach the live databases. Check your connection and try again.', retryable: true };
}

export function describeDetailError(error: unknown): LiveProblem {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === 'not_found') return { message: 'This title isn’t available anymore.', retryable: false };
  if (code === 'not_configured') return { message: 'This source isn’t set up on the server.', retryable: false };
  if (code === 'timeout') return { message: 'The source took too long to respond.', retryable: true };
  return { message: 'This title couldn’t be loaded right now.', retryable: true };
}

export function describeSeasonError(error: unknown): LiveProblem {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === 'not_found') return { message: 'There’s no episode list for this season.', retryable: false };
  if (code === 'not_configured') return { message: 'Episodes aren’t set up on the server.', retryable: false };
  if (error instanceof ApiError && error.status === 400) return { message: error.message, retryable: false };
  if (code === 'timeout') return { message: 'The episode list took too long to load.', retryable: true };
  return { message: 'The episode list couldn’t be loaded right now.', retryable: true };
}
