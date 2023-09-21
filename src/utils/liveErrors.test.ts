import { describe, expect, it } from 'vitest';
import { ApiError } from '../services/apiService';
import { describeDetailError, describeSearchErrors, describeSearchFailure } from './liveErrors';

describe('describeSearchErrors', () => {
  it('returns null when every source answered', () => {
    expect(describeSearchErrors([], 3, 5)).toBeNull();
  });

  it('names the missing types in a partial outage and says results are still shown', () => {
    const message = describeSearchErrors(
      [
        { type: 'movie', code: 'unavailable' },
        { type: 'tv', code: 'timeout' },
        { type: 'game', code: 'unavailable' },
      ],
      4,
      5,
    );
    expect(message).toEqual({
      message: 'Movies, TV and Games couldn’t be reached — showing results from the others.',
      retryable: true,
    });
  });

  it('distinguishes timeouts and the case where the remaining sources found nothing', () => {
    expect(describeSearchErrors([{ type: 'music', code: 'timeout' }], 0, 5)?.message).toBe(
      'Music didn’t respond in time, and nothing else matched.',
    );
  });

  it('reports a full outage without listing every type', () => {
    expect(describeSearchErrors([{ type: 'book', code: 'unavailable' }], 0, 1)?.message).toMatch(/couldn’t be reached/);
    const allUnconfigured = (['movie', 'tv', 'music', 'book', 'game'] as const).map((type) => ({
      type,
      code: 'not_configured' as const,
    }));
    expect(describeSearchErrors(allUnconfigured, 0, 5)).toEqual({
      message: 'Live search isn’t set up on the server yet.',
      retryable: false,
    });
  });
});

describe('describeSearchFailure', () => {
  it('passes through validation messages (no retry) but hides other failures', () => {
    expect(describeSearchFailure(new ApiError(400, 'Query must be 200 characters or fewer'))).toEqual({
      message: 'Query must be 200 characters or fewer',
      retryable: false,
    });
    expect(describeSearchFailure(new TypeError('Failed to fetch')).message).toMatch(/Check your connection/);
  });
});

describe('describeDetailError', () => {
  it('does not offer a retry for titles that are gone', () => {
    expect(describeDetailError(new ApiError(404, 'x', 'not_found'))).toEqual({
      message: 'This title isn’t available anymore.',
      retryable: false,
    });
  });

  it('offers a retry for timeouts but not for unconfigured sources', () => {
    expect(describeDetailError(new ApiError(504, 'x', 'timeout'))).toEqual({
      message: 'The source took too long to respond.',
      retryable: true,
    });
    expect(describeDetailError(new ApiError(503, 'x', 'not_configured')).retryable).toBe(false);
  });

  it('never shows raw error text', () => {
    const problem = describeDetailError(new Error('TMDb request failed: 401 Unauthorized'));
    expect(problem.message).toBe('This title couldn’t be loaded right now.');
    expect(problem.retryable).toBe(true);
  });
});
