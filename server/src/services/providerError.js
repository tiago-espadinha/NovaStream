// Providers throw ProviderError so routes can tell callers *what kind* of failure happened
// (and pick an HTTP status) without exposing raw upstream messages or configuration hints.
export const PROVIDER_TIMEOUT_MS = 8000;

export class ProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

/** Error for a non-OK upstream response; a 404 means the requested item doesn't exist. */
export function upstreamFailure(provider, res) {
  return new ProviderError(
    res.status === 404 ? 'not_found' : 'unavailable',
    `${provider} request failed: ${res.status} ${res.statusText}`,
  );
}

export function errorCode(err) {
  return err instanceof ProviderError ? err.code : 'unavailable';
}

/**
 * Runs `fn` and rejects with a timeout ProviderError if it hasn't settled within `ms`.
 * The caller stops waiting, but the provider's in-flight requests are abandoned, not aborted.
 */
export function withTimeout(fn, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ProviderError('timeout', `${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([Promise.resolve().then(fn), timeout]).finally(() => clearTimeout(timer));
}
