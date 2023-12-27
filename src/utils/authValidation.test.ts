import { describe, expect, it } from 'vitest';
import { validateCredentials, validatePasswordChange } from './authValidation';

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

describe('validatePasswordChange', () => {
  it('accepts a current password and a different 8+ character new one', () => {
    expect(validatePasswordChange('old secret', 'new secret')).toEqual({});
  });

  it('asks for the current password', () => {
    expect(validatePasswordChange('', 'new secret').currentPassword).toBe('Enter your current password.');
  });

  it('applies the server’s length rule, counting bytes at the top end', () => {
    expect(validatePasswordChange('old secret', 'short').newPassword).toMatch(/at least 8/);
    expect(validatePasswordChange('old secret', 'é'.repeat(37)).newPassword).toMatch(/at most 72/);
    expect(validatePasswordChange('old secret', 'a'.repeat(72))).toEqual({});
  });

  it('refuses a new password equal to the current one', () => {
    expect(validatePasswordChange('same secret', 'same secret').newPassword).toMatch(/different from your current/);
  });
});
