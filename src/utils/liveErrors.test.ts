import { describe, expect, it } from 'vitest';
import { ApiError } from '../services/apiService';
import {
  describeAlbumsError,
  describeDetailError,
  describeSeasonError,
  describeSearchErrors,
  describeSearchFailure,
  describeTrendingErrors,
} from './liveErrors';

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

describe('describeSeasonError', () => {
  it('only offers a retry when trying again could help', () => {
    const retryable = (error: unknown) => describeSeasonError(error).retryable;
    expect(retryable(new ApiError(404, 'x', 'not_found'))).toBe(false);
    expect(retryable(new ApiError(503, 'x', 'not_configured'))).toBe(false);
    expect(retryable(new ApiError(400, 'Pick a valid series and season.'))).toBe(false);
    expect(retryable(new ApiError(504, 'x', 'timeout'))).toBe(true);
    expect(retryable(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('talks about the season rather than the whole title, and hides raw errors', () => {
    expect(describeSeasonError(new ApiError(404, 'x', 'not_found')).message).toBe(
      'There’s no episode list for this season.',
    );
    expect(describeSeasonError(new Error('TMDb request failed: 401')).message).toBe(
      'The episode list couldn’t be loaded right now.',
    );
  });
});

describe('describeAlbumsError', () => {
  it('offers a retry for timeouts and network failures, and hides raw errors', () => {
    expect(describeAlbumsError(new ApiError(504, 'x', 'timeout')).retryable).toBe(true);
    expect(describeAlbumsError(new ApiError(503, 'x', 'not_configured')).retryable).toBe(false);
    expect(describeAlbumsError(new Error('Last.fm error 29: Rate limit')).message).toBe(
      'The album list couldn’t be loaded right now.',
    );
  });
});

describe('describeTrendingErrors', () => {
  it('returns null when every source answered', () => {
    expect(describeTrendingErrors([], 8)).toBeNull();
  });

  it('names the missing types when other sources still have trending items', () => {
    const problem = describeTrendingErrors(
      [
        { type: 'game', code: 'unavailable' },
        { type: 'music', code: 'unavailable' },
      ],
      12,
    );
    expect(problem).toEqual({
      message: 'Games and Music couldn’t be reached — showing what’s trending elsewhere.',
      retryable: true,
    });
  });

  it('stays quiet about unconfigured sources while others have items, but names transient ones', () => {
    expect(describeTrendingErrors([{ type: 'game', code: 'not_configured' }], 4)).toBeNull();
    expect(
      describeTrendingErrors(
        [
          { type: 'game', code: 'not_configured' },
          { type: 'tv', code: 'timeout' },
        ],
        4,
      ),
    ).toEqual({ message: 'TV didn’t respond in time — showing what’s trending elsewhere.', retryable: true });
  });

  it('reads as a failure when nothing could be shown', () => {
    const problem = describeTrendingErrors(
      [
        { type: 'movie', code: 'timeout' },
        { type: 'book', code: 'timeout' },
      ],
      0,
    );
    expect(problem).toEqual({ message: 'Trending took too long to load. Try again in a moment.', retryable: true });
  });

  it('does not offer a retry when the server has no provider keys', () => {
    expect(describeTrendingErrors([{ type: 'movie', code: 'not_configured' }], 0)).toEqual({
      message: 'Trending isn’t set up on the server yet.',
      retryable: false,
    });
  });
});
