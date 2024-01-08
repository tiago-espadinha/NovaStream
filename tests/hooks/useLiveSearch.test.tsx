// @vitest-environment jsdom
import '../helpers/dom';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveSearch } from '../../src/hooks/useLiveSearch';
import * as api from '../../src/services/apiService';
import { ApiError, type SearchResponse } from '../../src/services/apiService';
import type { ContentType, MusicKind } from '../../src/types';
import { deferred, media } from '../helpers/fixtures';

const config = vi.hoisted(() => ({ USE_MOCK: false, API_BASE_URL: 'http://test/api' }));

vi.mock('../../src/config', () => config);
vi.mock('../../src/services/apiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/apiService')>()),
  searchMedia: vi.fn(),
}));

const searchMedia = vi.mocked(api.searchMedia);

interface Props {
  query: string;
  activeType: ContentType | 'all';
  musicKind: MusicKind | 'all';
  language: string | undefined;
}

const DEFAULTS: Props = { query: 'heat', activeType: 'all', musicKind: 'all', language: 'en' };
const render = (props: Partial<Props> = {}) =>
  renderHook((current: Props) => useLiveSearch(current), { initialProps: { ...DEFAULTS, ...props } });

const debounce = () => act(async () => vi.advanceTimersByTimeAsync(350));

const movie = media('movie-1');
const book = media('book-1', { type: 'book' });
const answer: SearchResponse = { results: [movie, book], errors: [] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  config.USE_MOCK = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useLiveSearch', () => {
  it('waits for typing to pause before searching', async () => {
    searchMedia.mockResolvedValue(answer);
    const { result, rerender } = render({ query: 'h' });
    expect(result.current.loading).toBe(true);

    await act(async () => vi.advanceTimersByTimeAsync(349));
    rerender({ ...DEFAULTS, query: 'he' });
    await act(async () => vi.advanceTimersByTimeAsync(349));
    expect(searchMedia).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(searchMedia).toHaveBeenCalledTimes(1);
    expect(searchMedia).toHaveBeenCalledWith('he', 'all', 'all');
    expect(result.current.results).toEqual(answer.results);
    expect(result.current.loading).toBe(false);
  });

  it('never searches in mock mode', async () => {
    config.USE_MOCK = true;
    const { result } = render();
    await debounce();
    expect(searchMedia).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it.each([
    ['a blank query', '   '],
    ['a keyword with no value', 'genre:'],
  ])('clears everything for %s', async (_label, query) => {
    searchMedia.mockResolvedValue(answer);
    const { result, rerender } = render();
    await debounce();
    expect(result.current.results).toHaveLength(2);

    searchMedia.mockClear();
    rerender({ ...DEFAULTS, query });
    await debounce();
    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(searchMedia).not.toHaveBeenCalled();
  });

  it('asks for a music kind only on All and Music', async () => {
    searchMedia.mockResolvedValue(answer);
    render({ activeType: 'music', musicKind: 'album' });
    await debounce();
    expect(searchMedia).toHaveBeenLastCalledWith('heat', 'music', 'album');

    render({ activeType: 'movie', musicKind: 'album' });
    await debounce();
    expect(searchMedia).toHaveBeenLastCalledWith('heat', 'movie', 'all');
  });

  it('filters the last All search when switching tabs, instead of fetching again', async () => {
    searchMedia.mockResolvedValue(answer);
    const { result, rerender } = render();
    await debounce();

    rerender({ ...DEFAULTS, activeType: 'book' });
    await debounce();
    expect(searchMedia).toHaveBeenCalledTimes(1);
    expect(result.current.results).toEqual([book]);
    expect(result.current.loading).toBe(false);
  });

  it('fetches again for a tab whose source failed under All', async () => {
    searchMedia.mockResolvedValueOnce({ results: [movie], errors: [{ type: 'book', code: 'timeout' }] });
    const { rerender } = render();
    await debounce();

    searchMedia.mockResolvedValueOnce({ results: [book], errors: [] });
    rerender({ ...DEFAULTS, activeType: 'book' });
    await debounce();
    expect(searchMedia).toHaveBeenCalledTimes(2);
  });

  it('forgets the All search when the language changes, because its text is in the old one', async () => {
    searchMedia.mockResolvedValue(answer);
    const { rerender } = render();
    await debounce();

    rerender({ ...DEFAULTS, language: 'fr' });
    await debounce();
    expect(searchMedia).toHaveBeenCalledTimes(2);
  });

  it('reports a partial outage as a warning: results stay, and it has not failed', async () => {
    searchMedia.mockResolvedValue({ results: [movie], errors: [{ type: 'book', code: 'timeout' }] });
    const { result } = render();
    await debounce();
    expect(result.current.results).toEqual([movie]);
    expect(result.current.error?.message).toBe('Books didn’t respond in time — showing results from the others.');
    expect(result.current.failed).toBe(false);
  });

  it('treats a failed request as failed, and tries again on retry', async () => {
    searchMedia.mockRejectedValueOnce(new Error('offline'));
    const { result } = render();
    await debounce();
    expect(result.current.failed).toBe(true);
    expect(result.current.error?.retryable).toBe(true);
    expect(result.current.loading).toBe(false);

    searchMedia.mockResolvedValueOnce(answer);
    act(() => result.current.retry());
    await debounce();
    expect(searchMedia).toHaveBeenCalledTimes(2);
    expect(result.current.failed).toBe(false);
    expect(result.current.results).toEqual(answer.results);
  });

  it('shows the server’s wording for bad input, with no retry', async () => {
    searchMedia.mockRejectedValue(new ApiError(400, 'Query is too long.'));
    const { result } = render();
    await debounce();
    expect(result.current.error).toEqual({ message: 'Query is too long.', retryable: false });
  });

  it('ignores a slow answer for a query the viewer has moved on from', async () => {
    const slow = deferred<SearchResponse>();
    searchMedia.mockReturnValueOnce(slow.promise);
    const { result, rerender } = render({ query: 'old' });
    await debounce();

    searchMedia.mockResolvedValueOnce({ results: [book], errors: [] });
    rerender({ ...DEFAULTS, query: 'new' });
    await debounce();
    expect(result.current.results).toEqual([book]);

    await act(async () => slow.resolve({ results: [movie], errors: [] }));
    expect(result.current.results).toEqual([book]);
    expect(result.current.loading).toBe(false);
  });

  it('sends nothing once unmounted', async () => {
    const { unmount } = render();
    unmount();
    await vi.advanceTimersByTimeAsync(350);
    expect(searchMedia).not.toHaveBeenCalled();
  });
});
