import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderError } from '../services/providerError.js';
import { failureResponse } from './media.js';

test('maps each provider error code to an HTTP status with client-safe copy', () => {
  const cases = { not_found: 404, timeout: 504, not_configured: 503, unavailable: 502 };
  for (const [code, status] of Object.entries(cases)) {
    const response = failureResponse(new ProviderError(code, `raw upstream detail for ${code}`));
    assert.equal(response.status, status);
    assert.equal(response.body.code, code);
    assert.equal(response.body.error.includes('raw upstream'), false);
  }
});

test('treats unknown errors as unavailable without echoing their message', () => {
  const response = failureResponse(new Error('TMDb request failed: 401 Unauthorized'));
  assert.deepEqual(response, {
    status: 502,
    body: { error: 'The source couldn’t be reached.', code: 'unavailable' },
  });
});
