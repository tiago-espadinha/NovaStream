// @vitest-environment jsdom
import '../helpers/dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFavorites } from '../../src/hooks/useFavorites';
import * as api from '../../src/services/apiService';
import { ApiError } from '../../src/services/apiService';
import type { MediaSummary } from '../../src/types';
import { deferred, media } from '../helpers/fixtures';

const auth = vi.hoisted(() => ({ token: null as string | null, endSession: vi.fn() }));

vi.mock('../../src/context/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../src/services/apiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/apiService')>()),
  getSavedMedia: vi.fn(),
  saveMedia: vi.fn(),
  removeSavedMedia: vi.fn(),
}));

const getSavedMedia = vi.mocked(api.getSavedMedia);
const saveMedia = vi.mocked(api.saveMedia);
const removeSavedMedia = vi.mocked(api.removeSavedMedia);

const KEY = 'nova-stream:favorites';
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') as MediaSummary[];
const seedGuest = (...items: MediaSummary[]) => localStorage.setItem(KEY, JSON.stringify(items));
const expired = () => new ApiError(401, 'Unauthorized');

beforeEach(() => {
  vi.resetAllMocks();
  auth.token = null;
});

describe('useFavorites as a guest', () => {
  it('saves and removes in this browser without touching the network', async () => {
    const { result } = renderHook(() => useFavorites());
    const item = media('movie-1');

    await act(() => result.current.toggleFavorite(item));
    expect(result.current.isFavorite('movie-1')).toBe(true);
    expect(stored()).toEqual([item]);

    await act(() => result.current.toggleFavorite(item));
    expect(result.current.isFavorite('movie-1')).toBe(false);
    expect(stored()).toEqual([]);
    expect(saveMedia).not.toHaveBeenCalled();
    expect(getSavedMedia).not.toHaveBeenCalled();
    expect(result.current.status).toBe('ready');
  });

  it('explains where favorites are kept once per visit, offering sign-in', async () => {
    const { result } = renderHook(() => useFavorites());

    await act(() => result.current.toggleFavorite(media('movie-1', { title: 'Heat' })));
    expect(result.current.notice).toEqual({
      message: 'Saved “Heat” in this browser. Sign in to keep your favorites on any device.',
      error: false,
      offerSignIn: true,
    });

    await act(() => result.current.toggleFavorite(media('movie-2')));
    expect(result.current.notice).toBeNull();
  });

  it('ignores stored data that is unreadable or not a title', () => {
    localStorage.setItem(KEY, 'not json');
    expect(renderHook(() => useFavorites()).result.current.savedMedia).toEqual([]);

    const good = media('movie-1');
    localStorage.setItem(KEY, JSON.stringify([good, { id: 'x' }, { ...good, id: 'y', type: 'podcast' }]));
    expect(renderHook(() => useFavorites()).result.current.savedMedia).toEqual([good]);
  });

  it('keeps working for the session when browser storage refuses writes', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { result } = renderHook(() => useFavorites());
    await act(() => result.current.toggleFavorite(media('movie-1')));
    expect(result.current.isFavorite('movie-1')).toBe(true);
    setItem.mockRestore();
  });
});

describe('useFavorites signed in', () => {
  beforeEach(() => {
    auth.token = 'token-a';
  });

  async function ready(savedMedia: MediaSummary[] = []) {
    getSavedMedia.mockResolvedValue({ savedMedia });
    const hook = renderHook(() => useFavorites());
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return hook;
  }

  it('reports loading, then the account list, with the token', async () => {
    const load = deferred<{ savedMedia: MediaSummary[] }>();
    getSavedMedia.mockReturnValue(load.promise);
    const { result } = renderHook(() => useFavorites());
    expect(result.current.status).toBe('loading');

    await act(async () => load.resolve({ savedMedia: [media('movie-1')] }));
    expect(getSavedMedia).toHaveBeenCalledWith('token-a');
    expect(result.current.status).toBe('ready');
    expect(result.current.isFavorite('movie-1')).toBe(true);
  });

  it('refuses a change before the list has loaded, because the heart could be wrong', async () => {
    getSavedMedia.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useFavorites());

    await act(() => result.current.toggleFavorite(media('movie-1')));
    expect(result.current.notice).toEqual({
      message: 'Your favorites are still loading. Try again in a moment.',
      error: true,
    });
    expect(saveMedia).not.toHaveBeenCalled();
  });

  it('adds and removes through the API, showing what the server returns', async () => {
    const { result } = await ready([media('movie-1')]);

    saveMedia.mockResolvedValue({ savedMedia: [media('movie-1'), media('movie-2')] });
    await act(() => result.current.toggleFavorite(media('movie-2')));
    expect(saveMedia).toHaveBeenCalledWith('token-a', media('movie-2'));
    expect(result.current.isFavorite('movie-2')).toBe(true);

    removeSavedMedia.mockResolvedValue({ savedMedia: [media('movie-2')] });
    await act(() => result.current.toggleFavorite(media('movie-1')));
    expect(removeSavedMedia).toHaveBeenCalledWith('token-a', 'movie-1');
    expect(result.current.isFavorite('movie-1')).toBe(false);
  });

  it('sends one request for repeat clicks while the first is unanswered', async () => {
    const { result } = await ready();
    const save = deferred<{ savedMedia: MediaSummary[] }>();
    saveMedia.mockReturnValue(save.promise);

    await act(async () => {
      void result.current.toggleFavorite(media('movie-1'));
      void result.current.toggleFavorite(media('movie-1'));
    });
    await act(async () => save.resolve({ savedMedia: [media('movie-1')] }));
    expect(saveMedia).toHaveBeenCalledTimes(1);
  });

  it('names the title when a change fails, and leaves the list as it was', async () => {
    const { result } = await ready();
    saveMedia.mockRejectedValue(new ApiError(500, 'boom'));

    await act(() => result.current.toggleFavorite(media('movie-1', { title: 'Heat' })));
    expect(result.current.notice).toEqual({ message: 'Couldn’t save “Heat”. Try again.', error: true });
    expect(result.current.isFavorite('movie-1')).toBe(false);
  });

  it('ends the session on a 401, saying which change did not happen', async () => {
    const { result } = await ready([media('movie-1', { title: 'Heat' })]);
    removeSavedMedia.mockRejectedValue(expired());

    await act(() => result.current.toggleFavorite(media('movie-1', { title: 'Heat' })));
    expect(auth.endSession).toHaveBeenCalledWith(
      'Your session expired, so “Heat” wasn’t removed. Sign in and try again.',
    );
  });

  it('shows an error status when loading fails, and retries on request', async () => {
    getSavedMedia.mockRejectedValueOnce(new ApiError(500, 'boom'));
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.status).toBe('error'));

    await act(() => result.current.toggleFavorite(media('movie-1')));
    expect(result.current.notice?.message).toMatch(/couldn’t be loaded/);

    getSavedMedia.mockResolvedValue({ savedMedia: [media('movie-1')] });
    act(() => result.current.retryLoad());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isFavorite('movie-1')).toBe(true);
  });

  it('ends the session when the load answers 401', async () => {
    getSavedMedia.mockRejectedValue(expired());
    renderHook(() => useFavorites());
    await waitFor(() => expect(auth.endSession).toHaveBeenCalled());
  });

  it('ignores a slow answer from the account that signed out', async () => {
    const slow = deferred<{ savedMedia: MediaSummary[] }>();
    getSavedMedia.mockReturnValueOnce(slow.promise);
    const { result, rerender } = renderHook(() => useFavorites());

    auth.token = 'token-b';
    getSavedMedia.mockResolvedValueOnce({ savedMedia: [media('movie-b')] });
    rerender();
    await waitFor(() => expect(result.current.isFavorite('movie-b')).toBe(true));

    await act(async () => slow.resolve({ savedMedia: [media('movie-a')] }));
    expect(result.current.isFavorite('movie-a')).toBe(false);
    expect(result.current.isFavorite('movie-b')).toBe(true);
  });

  it('drops a notice when the account changes, and on dismiss', async () => {
    const { result, rerender } = await ready();
    saveMedia.mockRejectedValue(new ApiError(500, 'boom'));
    await act(() => result.current.toggleFavorite(media('movie-1')));
    expect(result.current.notice).not.toBeNull();

    act(() => result.current.dismissNotice());
    expect(result.current.notice).toBeNull();

    await act(() => result.current.toggleFavorite(media('movie-1')));
    expect(result.current.notice).not.toBeNull();
    auth.token = null;
    rerender();
    expect(result.current.notice).toBeNull();
  });
});

describe('useFavorites guest merge at sign-in', () => {
  const account = media('movie-account');
  const both = media('movie-both');
  const guestOnly = media('movie-guest');

  /** Starts as a guest with these favorites, then signs in to an account holding `savedMedia`. */
  function signIn(savedMedia: MediaSummary[], ...guest: MediaSummary[]) {
    seedGuest(...guest);
    getSavedMedia.mockResolvedValue({ savedMedia });
    const hook = renderHook(() => useFavorites());
    auth.token = 'token-a';
    hook.rerender();
    return hook;
  }

  it('uploads only what the account lacks, then clears those from the browser', async () => {
    saveMedia.mockResolvedValue({ savedMedia: [account, both, guestOnly] });
    const { result } = signIn([account, both], both, guestOnly);

    await waitFor(() => expect(result.current.isFavorite('movie-guest')).toBe(true));
    expect(saveMedia).toHaveBeenCalledTimes(1);
    expect(saveMedia).toHaveBeenCalledWith('token-a', guestOnly);
    await waitFor(() => expect(stored()).toEqual([]));
    expect(result.current.notice).toEqual({
      message: 'Added 1 favorite from this browser to your account.',
      error: false,
    });
    expect(result.current.savedMedia.map(({ id }) => id).sort()).toEqual([
      'movie-account',
      'movie-both',
      'movie-guest',
    ]);
  });

  it('stays quiet when every guest favorite was already on the account', async () => {
    const { result } = signIn([both], both);
    await waitFor(() => expect(stored()).toEqual([]));
    expect(saveMedia).not.toHaveBeenCalled();
    expect(result.current.notice).toBeNull();
  });

  it('keeps a favorite that failed in the browser, so the next load tries again', async () => {
    const other = media('movie-other');
    saveMedia.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce({ savedMedia: [other] });
    const { result } = signIn([], guestOnly, other);

    await waitFor(() => expect(stored()).toEqual([guestOnly]));
    expect(result.current.notice?.error).toBe(true);
    expect(result.current.notice?.message).toContain('Added 1 favorite to your account.');
    expect(result.current.notice?.message).toContain('1 favorite couldn’t be added yet');
    expect(result.current.savedMedia).toEqual([other]);
  });

  it('stops at a full account (409), keeping the rest in the browser', async () => {
    const third = media('movie-third');
    saveMedia.mockRejectedValue(new ApiError(409, 'Your favorites are full.'));
    const { result } = signIn([], guestOnly, third);

    await waitFor(() => expect(result.current.notice).not.toBeNull());
    expect(saveMedia).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toEqual({
      message: 'Your favorites are full. 2 favorites from this browser stay here for now.',
      error: true,
    });
    expect(stored()).toEqual([guestOnly, third]);
  });

  it('ends the session on a 401 mid-merge without losing anything', async () => {
    saveMedia.mockRejectedValue(expired());
    signIn([], guestOnly);

    await waitFor(() => expect(auth.endSession).toHaveBeenCalled());
    expect(stored()).toEqual([guestOnly]);
  });

  it('refuses clicks until the merge has finished', async () => {
    const upload = deferred<{ savedMedia: MediaSummary[] }>();
    saveMedia.mockReturnValue(upload.promise);
    const { result } = signIn([], guestOnly);
    await waitFor(() => expect(saveMedia).toHaveBeenCalledTimes(1));

    await act(() => result.current.toggleFavorite(media('movie-other')));
    expect(result.current.notice?.message).toMatch(/Still adding favorites/);
    expect(saveMedia).toHaveBeenCalledTimes(1);

    await act(async () => upload.resolve({ savedMedia: [guestOnly] }));
    await waitFor(() => expect(result.current.notice?.error).toBe(false));
  });

  it('drops a merge whose account signed out while it ran', async () => {
    const upload = deferred<{ savedMedia: MediaSummary[] }>();
    const later = media('movie-later');
    saveMedia.mockReturnValueOnce(upload.promise);
    const { result, rerender } = signIn([], guestOnly, later);
    await waitFor(() => expect(saveMedia).toHaveBeenCalledTimes(1));

    auth.token = null;
    rerender();
    await act(async () => upload.resolve({ savedMedia: [guestOnly] }));

    expect(saveMedia).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toBeNull();
    expect(stored().map(({ id }) => id)).toEqual(['movie-guest', 'movie-later']);
  });
});
