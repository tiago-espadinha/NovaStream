import { describe, expect, it } from 'vitest';
import { validateCredentials } from './authValidation';

describe('validateCredentials', () => {
  it('accepts a well-formed email and an 8+ character password', () => {
    expect(validateCredentials(' ana@example.com ', 'longenough')).toEqual({});
  });

  it('flags a malformed email and a short password independently', () => {
    const errors = validateCredentials('not-an-email', 'short');
    expect(errors.email).toMatch(/valid email/);
    expect(errors.password).toMatch(/at least 8/);
  });
});
