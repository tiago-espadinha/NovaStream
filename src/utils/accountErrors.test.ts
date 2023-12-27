import { describe, expect, it } from 'vitest';
import { ApiError } from '../services/apiService';
import { describeAccountError, describeGuestMerge, isSessionEnded } from './accountErrors';

describe('describeGuestMerge', () => {
  it('confirms a full merge and says nothing when there was nothing to move', () => {
    expect(describeGuestMerge(2, 0)).toEqual({ message: 'Added 2 favorites from this browser to your account.', error: false });
    expect(describeGuestMerge(0, 0)).toBeNull();
  });

  it('never hides a partial failure behind a success', () => {
    const notice = describeGuestMerge(2, 1);
    expect(notice?.error).toBe(true);
    expect(notice?.message).toMatch(/^Added 2 favorites to your account\. 1 favorite couldn’t be added yet/);
    expect(describeGuestMerge(0, 3)?.message).toMatch(/^3 favorites couldn’t be added yet/);
  });
});

describe('isSessionEnded', () => {
  it('is true only for a 401 from the API', () => {
    expect(isSessionEnded(new ApiError(401, 'Invalid or expired token'))).toBe(true);
    expect(isSessionEnded(new ApiError(503, 'x', 'not_configured'))).toBe(false);
    expect(isSessionEnded(new TypeError('Failed to fetch'))).toBe(false);
    expect(isSessionEnded(new ApiError(403, 'That password isn’t right.', 'wrong_password'))).toBe(false);
  });
});

describe('describeAccountError', () => {
  it('shows the server’s user-facing message for client errors', () => {
    expect(describeAccountError(new ApiError(401, 'Invalid email or password'), 'fallback')).toBe('Invalid email or password');
    expect(describeAccountError(new ApiError(409, 'An account with that email already exists'), 'fallback')).toMatch(/already exists/);
    expect(describeAccountError(new ApiError(403, 'That password isn’t right.', 'wrong_password'), 'fallback')).toBe(
      'That password isn’t right.',
    );
  });

  it('never shows raw network or server failure text', () => {
    expect(describeAccountError(new TypeError('Failed to fetch'), 'fallback')).toMatch(/Couldn’t reach the server/);
    expect(describeAccountError(new ApiError(500, 'Internal server error'), 'Sign-in failed.')).toBe('Sign-in failed.');
  });

  it('explains when accounts are not configured on the server', () => {
    expect(describeAccountError(new ApiError(503, 'x', 'not_configured'), 'fallback')).toBe(
      'Accounts aren’t set up on the server yet.',
    );
  });
});
