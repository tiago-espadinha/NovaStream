// @vitest-environment jsdom
import '../helpers/dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrending } from '../../src/hooks/useTrending';
import * as api from '../../src/services/apiService';
import type { SearchResponse } from '../../src/services/apiService';
import { deferred, media } from '../helpers/fixtures';

vi.mock('../../src/services/apiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/apiService')>()),
  getTrending: vi.fn(),
}));

const getTrending = vi.mocked(api.getTrending);
const movie = media('movie-1');

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useTrending', () => {
  it('does not load when disabled', () => {
    const { result } = renderHook(() => useTrending(false));
    expect(result.current.loading).toBe(false);
    expect(getTrending).not.toHaveBeenCalled();
  });

  it('is loading from the first render, then shows the feed', async () => {
    const load = deferred<SearchResponse>();
    getTrending.mockReturnValue(load.promise);
    const { result } = renderHook(() => useTrending(true));
    expect(result.current.loading).toBe(true);

    await act(async () => load.resolve({ results: [movie], errors: [] }));
    expect(result.current).toMatchObject({ items: [movie], loading: false, problem: null });
  });

  it('keeps what loaded and names the source that did not answer', async () => {
    getTrending.mockResolvedValue({ results: [movie], errors: [{ type: 'book', code: 'unavailable' }] });
    const { result } = renderHook(() => useTrending(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([movie]);
    expect(result.current.problem).toEqual({
      message: 'Books couldn’t be reached — showing what’s trending elsewhere.',
      retryable: true,
    });
  });

  it('empties the feed when the request fails, and loads again on retry', async () => {
    getTrending.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useTrending(true));
    await waitFor(() => expect(result.current.problem?.retryable).toBe(true));
    expect(result.current.items).toEqual([]);

    getTrending.mockResolvedValueOnce({ results: [movie], errors: [] });
    act(() => result.current.retry());
    expect(result.current.loading).toBe(true);
    expect(result.current.problem).toBeNull();
    await waitFor(() => expect(result.current.items).toEqual([movie]));
  });

  it('loads again for a new language, ignoring a slow answer in the old one', async () => {
    const slow = deferred<SearchResponse>();
    getTrending.mockReturnValueOnce(slow.promise);
    const { result, rerender } = renderHook(({ language }) => useTrending(true, language), {
      initialProps: { language: 'en' },
    });

    const french = media('movie-fr');
    getTrending.mockResolvedValueOnce({ results: [french], errors: [] });
    rerender({ language: 'fr' });
    await waitFor(() => expect(result.current.items).toEqual([french]));

    await act(async () => slow.resolve({ results: [movie], errors: [] }));
    expect(result.current.items).toEqual([french]);
  });
});
