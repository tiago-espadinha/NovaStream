// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaDetail } from '../../src/screens/detail/MediaDetail';
import * as api from '../../src/services/apiService';
import { BUILT_IN_COLLECTIONS } from '../../src/utils/collections';
import { contentItem, media } from '../helpers/fixtures';

vi.mock('../../src/services/apiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/apiService')>()),
  getArtistAlbums: vi.fn(),
  getTvSeason: vi.fn(),
}));

const getArtistAlbums = vi.mocked(api.getArtistAlbums);
const getTvSeason = vi.mocked(api.getTvSeason);

const item = contentItem('movie-1', { title: 'Heat', releaseYear: 1995 });

function detail(overrides: Partial<ComponentProps<typeof MediaDetail>> = {}) {
  const handlers = {
    onToggleFavorite: vi.fn(),
    onOpenRelated: vi.fn(),
    onBack: vi.fn(),
    onToggleCollection: vi.fn(),
    onCreateCollection: vi.fn(),
    onSearchTerm: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <MediaDetail
      item={item}
      favorite={false}
      isFavorite={() => false}
      collections={[]}
      allCollections={[]}
      collectionIds={[]}
      collectionsReady
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('MediaDetail', () => {
  it('is a dialog named by the title, focusing Close', () => {
    detail();
    expect(screen.getByRole('dialog', { name: 'Heat' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close details' }));
  });

  it('closes from the button, the backdrop and Escape, but not from inside the panel', () => {
    const { onClose } = detail();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('toggles the favorite, showing its state', () => {
    const { onToggleFavorite } = detail();
    const save = screen.getByRole('button', { name: 'Save to favorites' });
    expect(save.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(save);
    expect(onToggleFavorite).toHaveBeenCalledWith(item);
  });

  it('shows the saved state when already a favorite', () => {
    detail({ favorite: true });
    expect(screen.getByRole('button', { name: 'Saved to favorites' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('turns genres and tags into searches, listing a genre once when both have it', () => {
    const { onSearchTerm } = detail({
      item: { ...item, genres: ['Crime', 'Drama'], tags: ['drama', 'heist'] },
    });
    const group = within(screen.getByRole('group', { name: 'Search by genre or tag' }));
    expect(group.getAllByRole('button').map((button) => button.textContent)).toEqual(['Crime', '#drama', '#heist']);

    fireEvent.click(group.getByRole('button', { name: 'Crime' }));
    expect(onSearchTerm).toHaveBeenCalledWith('genre: Crime');
    fireEvent.click(group.getByRole('button', { name: '#heist' }));
    expect(onSearchTerm).toHaveBeenCalledWith('tag: heist');
  });

  it('offers Back only when there is a title to return to', () => {
    detail();
    expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull();
  });

  it('goes back to the title it was opened from', () => {
    const { onBack } = detail({ backTo: 'The Artist' });
    fireEvent.click(screen.getByRole('button', { name: 'Back to The Artist' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('opens the artwork in a viewer on top, and Escape closes only that', () => {
    const { onClose } = detail({ item: { ...item, posterUrl: 'https://img/heat.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: 'View full artwork for Heat' }));
    expect(screen.getByRole('dialog', { name: 'Heat artwork' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Heat artwork' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Heat' })).toBeTruthy();
  });

  it('has a generated panel instead of an artwork button when there is no poster', () => {
    detail();
    expect(screen.queryByRole('button', { name: /View full artwork/ })).toBeNull();
    expect(document.querySelector<HTMLElement>('.detail-fallback')?.style.background).toContain('linear-gradient');
  });

  it('shows its own wording for what is missing', () => {
    detail({ item: { ...item, overview: '', rating: null, creator: null } });
    expect(screen.getByText('No synopsis available.')).toBeTruthy();
    expect(screen.getByText('Not yet rated')).toBeTruthy();
    expect(screen.getByText('Unknown')).toBeTruthy();
  });

  it('shows the creator under the label for its role, and the cast', () => {
    detail({ item: { ...item, creator: 'Michael Mann', cast: ['Al Pacino', 'Robert De Niro'] } });
    expect(screen.getByText('Director').nextElementSibling?.textContent).toBe('Michael Mann');
    expect(screen.getByText('Cast').nextElementSibling?.textContent).toBe('Al Pacino, Robert De Niro');
  });

  it('writes play counts the way the language writes numbers, and numbers the tracks', () => {
    detail({
      item: {
        ...item,
        type: 'music',
        musicKind: 'album',
        playStats: { listeners: '2,000', playcount: '1,234,567' },
        tracklist: [
          { name: 'Intro', duration: '1:00' },
          { name: 'Outro', duration: '' },
        ],
      },
    });
    expect(screen.getByText('Plays').nextElementSibling?.textContent).toBe('1,234,567');
    expect(screen.getByText('Listeners').nextElementSibling?.textContent).toBe('2,000');
    const tracks = within(screen.getByRole('region', { name: 'Tracklist' })).getAllByRole('listitem');
    expect(tracks.map((track) => track.textContent)).toEqual(['1Intro1:00', '2Outro—']);
  });

  it('lists streaming platforms for films and series only', () => {
    const platforms = ['Streaming on Netflix', 'Buy on Amazon'];
    detail({ item: { ...item, platforms } });
    const streaming = within(screen.getByRole('region', { name: 'Streaming' }));
    expect(streaming.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['Netflix']);
  });

  it('leaves streaming out for other formats', () => {
    detail({ item: { ...item, type: 'book', creatorRole: 'author', platforms: ['Streaming on Netflix'] } });
    expect(screen.queryByRole('region', { name: 'Streaming' })).toBeNull();
  });

  it('shows the collection menu only when there are collections for this format', () => {
    detail({ collections: BUILT_IN_COLLECTIONS.slice(0, 2), allCollections: BUILT_IN_COLLECTIONS });
    expect(screen.getByRole('button', { name: /^Collections/ })).toBeTruthy();
  });

  it('has no collection menu with no collections', () => {
    detail();
    expect(screen.queryByRole('button', { name: /^Collections/ })).toBeNull();
  });

  it('loads a series’ episodes from the id after "tv-"', () => {
    getTvSeason.mockReturnValue(new Promise(() => {}));
    detail({
      item: { ...item, id: 'tv-42', type: 'tv', seasons: [{ number: 1, name: null, episodeCount: 1 }] },
    });
    expect(getTvSeason).toHaveBeenCalledWith('42', 1);
  });

  it('loads an artist’s albums from the id after "music-", and opens one with the list', async () => {
    const album = media('music-album', { type: 'music', title: 'The Album' });
    getArtistAlbums.mockResolvedValue({ albums: [album] });
    const { onOpenRelated } = detail({
      item: { ...item, id: 'music-the-artist', type: 'music', musicKind: 'artist' },
    });
    expect(getArtistAlbums).toHaveBeenCalledWith('the-artist');

    fireEvent.click(await screen.findByRole('button', { name: 'The Album' }));
    expect(onOpenRelated).toHaveBeenCalledWith('music-album', [album]);
  });

  it('on return, reuses the albums and focuses the card that was opened', () => {
    const album = media('music-album', { type: 'music', title: 'The Album' });
    detail({
      item: { ...item, id: 'music-the-artist', type: 'music', musicKind: 'artist' },
      initialAlbums: [album],
      returnFocusTo: 'music-album',
    });
    expect(getArtistAlbums).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'The Album' }));
  });

  it('keeps focus on Close when the card it came from is gone', () => {
    detail({
      item: { ...item, id: 'music-the-artist', type: 'music', musicKind: 'artist' },
      initialAlbums: [],
      returnFocusTo: 'music-album',
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close details' }));
  });
});
