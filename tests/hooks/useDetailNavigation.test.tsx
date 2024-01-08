// @vitest-environment jsdom
import '../helpers/dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockContent } from '../../src/data/mockData';
import { useDetailNavigation } from '../../src/hooks/useDetailNavigation';
import * as api from '../../src/services/apiService';
import { ApiError } from '../../src/services/apiService';
import type { ContentItem } from '../../src/types';
import { contentItem, deferred, media } from '../helpers/fixtures';

vi.mock('../../src/services/apiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/apiService')>()),
  getMediaDetail: vi.fn(),
}));

const getMediaDetail = vi.mocked(api.getMediaDetail);

const artist = contentItem('music-artist', { type: 'music', title: 'The Artist', musicKind: 'artist' });
const album = contentItem('music-album', { type: 'music', title: 'The Album', musicKind: 'album' });

beforeEach(() => {
  vi.resetAllMocks();
});

const render = () => renderHook(({ language }) => useDetailNavigation(language), { initialProps: { language: 'en' } });

/** Opens the artist, then one of its albums. */
async function openAlbumFromArtist() {
  const hook = render();
  getMediaDetail.mockResolvedValueOnce(artist);
  act(() => hook.result.current.select('music-artist'));
  await waitFor(() => expect(hook.result.current.detail).toBe(artist));

  getMediaDetail.mockResolvedValueOnce(album);
  act(() => hook.result.current.openRelated('music-album', [media('music-album')]));
  await waitFor(() => expect(hook.result.current.detail).toBe(album));
  return hook;
}

describe('useDetailNavigation', () => {
  it('shows nothing until a title is selected', () => {
    const { result } = render();
    expect(result.current).toMatchObject({ selectedId: null, detail: null, loading: false, error: null });
    expect(getMediaDetail).not.toHaveBeenCalled();
  });

  it('loads a live title from its id, keeping hyphens in the external id', async () => {
    const load = deferred<ContentItem>();
    getMediaDetail.mockReturnValue(load.promise);
    const { result } = render();

    act(() => result.current.select('music-the-cure'));
    expect(getMediaDetail).toHaveBeenCalledWith('music', 'the-cure');
    expect(result.current.loading).toBe(true);
    expect(result.current.detail).toBeNull();

    await act(async () => load.resolve(artist));
    expect(result.current.detail).toBe(artist);
    expect(result.current.loading).toBe(false);
  });

  it('uses the bundled record for a mock title, with no request', () => {
    const { result } = render();
    act(() => result.current.select(mockContent[0].id));
    expect(result.current.detail).toBe(mockContent[0]);
    expect(getMediaDetail).not.toHaveBeenCalled();
  });

  it('reports a failure, and loads again on retry', async () => {
    getMediaDetail.mockRejectedValueOnce(new ApiError(500, 'boom'));
    const { result } = render();
    act(() => result.current.select('movie-1'));
    await waitFor(() => expect(result.current.error?.retryable).toBe(true));
    expect(result.current.loading).toBe(false);

    getMediaDetail.mockResolvedValueOnce(contentItem('movie-1'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.detail?.id).toBe('movie-1'));
    expect(result.current.error).toBeNull();
  });

  it('does not offer a retry for a title that no longer exists', async () => {
    getMediaDetail.mockRejectedValue(new ApiError(404, 'gone', 'not_found'));
    const { result } = render();
    act(() => result.current.select('movie-1'));
    await waitFor(() =>
      expect(result.current.error).toEqual({
        message: 'This title isn’t available anymore.',
        retryable: false,
      }),
    );
  });

  it('ignores a slow answer for a title the viewer has left', async () => {
    const slow = deferred<ContentItem>();
    getMediaDetail.mockReturnValueOnce(slow.promise);
    const { result } = render();
    act(() => result.current.select('movie-slow'));

    getMediaDetail.mockResolvedValueOnce(contentItem('movie-new'));
    act(() => result.current.select('movie-new'));
    await waitFor(() => expect(result.current.detail?.id).toBe('movie-new'));

    await act(async () => slow.resolve(contentItem('movie-slow')));
    expect(result.current.detail?.id).toBe('movie-new');
  });

  it('loads the title again when the language changes', async () => {
    getMediaDetail.mockResolvedValue(contentItem('movie-1'));
    const { result, rerender } = render();
    act(() => result.current.select('movie-1'));
    await waitFor(() => expect(result.current.detail).not.toBeNull());

    rerender({ language: 'fr' });
    await waitFor(() => expect(getMediaDetail).toHaveBeenCalledTimes(2));
  });

  it('closing clears the title', async () => {
    getMediaDetail.mockResolvedValue(contentItem('movie-1'));
    const { result } = render();
    act(() => result.current.select('movie-1'));
    await waitFor(() => expect(result.current.detail).not.toBeNull());

    act(() => result.current.select(null));
    expect(result.current.detail).toBeNull();
    expect(result.current.selectedId).toBeNull();
  });
});

describe('useDetailNavigation back navigation', () => {
  it('names the title Back returns to', async () => {
    const { result } = await openAlbumFromArtist();
    expect(result.current.backTo).toBe('The Artist');
    expect(result.current.returnedHere).toBeNull();
  });

  it('returns without fetching, with the albums and the card that was opened', async () => {
    const { result } = await openAlbumFromArtist();
    expect(getMediaDetail).toHaveBeenCalledTimes(2);

    act(() => result.current.back());
    expect(result.current.selectedId).toBe('music-artist');
    expect(result.current.detail).toBe(artist);
    expect(getMediaDetail).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.backTo).toBeUndefined();
    expect(result.current.returnedHere).toMatchObject({
      id: 'music-artist',
      openedId: 'music-album',
      albums: [media('music-album')],
    });
  });

  it('walks back one step at a time through a longer trail', async () => {
    const { result } = await openAlbumFromArtist();
    const song = contentItem('music-song', { type: 'music', title: 'The Song' });
    getMediaDetail.mockResolvedValueOnce(song);
    act(() => result.current.openRelated('music-song'));
    await waitFor(() => expect(result.current.detail).toBe(song));
    expect(result.current.backTo).toBe('The Album');

    act(() => result.current.back());
    expect(result.current.detail).toBe(album);
    expect(result.current.backTo).toBe('The Artist');

    act(() => result.current.back());
    expect(result.current.detail).toBe(artist);
    expect(result.current.backTo).toBeUndefined();
  });

  it('does nothing with no trail behind it', async () => {
    getMediaDetail.mockResolvedValue(artist);
    const { result } = render();
    act(() => result.current.select('music-artist'));
    await waitFor(() => expect(result.current.detail).toBe(artist));

    act(() => result.current.back());
    expect(result.current.detail).toBe(artist);
    expect(result.current.selectedId).toBe('music-artist');
  });

  it('forgets the trail on close, so the next title starts fresh', async () => {
    const { result } = await openAlbumFromArtist();
    act(() => result.current.select(null));
    expect(result.current.backTo).toBeUndefined();

    getMediaDetail.mockResolvedValueOnce(contentItem('movie-1'));
    act(() => result.current.select('movie-1'));
    await waitFor(() => expect(result.current.detail?.id).toBe('movie-1'));
    expect(result.current.backTo).toBeUndefined();
    expect(result.current.returnedHere).toBeNull();
  });

  it('can still go back when the related title failed to load', async () => {
    const hook = render();
    getMediaDetail.mockResolvedValueOnce(artist);
    act(() => hook.result.current.select('music-artist'));
    await waitFor(() => expect(hook.result.current.detail).toBe(artist));

    getMediaDetail.mockRejectedValueOnce(new ApiError(500, 'boom'));
    act(() => hook.result.current.openRelated('music-album'));
    await waitFor(() => expect(hook.result.current.error).not.toBeNull());
    expect(hook.result.current.backTo).toBe('The Artist');

    act(() => hook.result.current.back());
    expect(hook.result.current.detail).toBe(artist);
    expect(hook.result.current.error).toBeNull();
  });
});
