// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtistAlbums } from '../../src/screens/detail/ArtistAlbums';
import * as api from '../../src/services/apiService';
import { ApiError } from '../../src/services/apiService';
import type { MediaSummary } from '../../src/types';
import { media } from '../helpers/fixtures';

vi.mock('../../src/services/apiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/apiService')>()),
  getArtistAlbums: vi.fn(),
}));

const getArtistAlbums = vi.mocked(api.getArtistAlbums);
const album = media('music-album', { type: 'music', title: 'The Album' });

function albums(props: { initialAlbums?: MediaSummary[]; onSelect?: (id: string, list: MediaSummary[]) => void } = {}) {
  return render(
    <ArtistAlbums
      externalId="the-artist"
      isFavorite={() => false}
      onToggleFavorite={() => {}}
      onSelect={() => {}}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ArtistAlbums', () => {
  it('shows a spinner, then the artist’s albums', async () => {
    getArtistAlbums.mockResolvedValue({ albums: [album] });
    albums();
    expect(screen.getByText('Loading albums…')).toBeTruthy();
    expect(getArtistAlbums).toHaveBeenCalledWith('the-artist');

    expect(await screen.findByRole('button', { name: 'The Album' })).toBeTruthy();
    expect(screen.queryByText('Loading albums…')).toBeNull();
  });

  it('opens an album with the list it came from, for the way back', async () => {
    getArtistAlbums.mockResolvedValue({ albums: [album] });
    const onSelect = vi.fn();
    albums({ onSelect });
    fireEvent.click(await screen.findByRole('button', { name: 'The Album' }));
    expect(onSelect).toHaveBeenCalledWith('music-album', [album]);
  });

  it('skips the request when coming back with albums already loaded', () => {
    albums({ initialAlbums: [album] });
    expect(getArtistAlbums).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'The Album' })).toBeTruthy();
  });

  it('reads "not found" as no albums, not as a failure', async () => {
    getArtistAlbums.mockRejectedValue(new ApiError(404, 'gone', 'not_found'));
    albums();
    expect(await screen.findByText('No albums found.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('offers a retry on failure, keeping focus on the heading while it reloads', async () => {
    getArtistAlbums.mockRejectedValueOnce(new ApiError(500, 'boom'));
    albums();
    expect(await screen.findByText('The album list couldn’t be loaded right now.')).toBeTruthy();

    getArtistAlbums.mockResolvedValueOnce({ albums: [album] });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Albums' }));
    expect(await screen.findByRole('button', { name: 'The Album' })).toBeTruthy();
    await waitFor(() => expect(getArtistAlbums).toHaveBeenCalledTimes(2));
  });

  it('has no retry when albums are not set up on the server', async () => {
    getArtistAlbums.mockRejectedValue(new ApiError(503, 'no key', 'not_configured'));
    albums();
    expect(await screen.findByText('Albums aren’t set up on the server.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
