import { errorCode, PROVIDER_TIMEOUT_MS, withTimeout } from './providerError.js';

/**
 * Runs one search per media type in parallel. A provider that fails or exceeds the timeout
 * contributes an error entry ({ type, code }) instead of failing the whole search; raw
 * provider messages are logged here and never returned to the client.
 */
export async function searchAcross(
  types,
  searchType,
  { timeoutMs = PROVIDER_TIMEOUT_MS, log = console.warn, label = 'search' } = {},
) {
  const settled = await Promise.allSettled(
    types.map((type) => withTimeout(() => searchType(type), timeoutMs, `${type} ${label}`)),
  );

  const results = [];
  const errors = [];
  settled.forEach((outcome, i) => {
    const type = types[i];
    if (outcome.status === 'fulfilled') {
      results.push(...outcome.value);
      return;
    }
    const code = errorCode(outcome.reason);
    log(`[${label}] ${type} failed (${code}): ${outcome.reason?.message ?? outcome.reason}`);
    errors.push({ type, code });
  });
  return { results, errors };
}
