// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { useCollections } from '../../src/hooks/useCollections';
import type { DetailNavigation } from '../../src/hooks/useDetailNavigation';
import { DetailOverlay } from '../../src/screens/detail/DetailOverlay';
import { BUILT_IN_COLLECTIONS } from '../../src/utils/collections';
import { contentItem } from '../helpers/fixtures';

const item = contentItem('movie-1', { title: 'Heat', genres: ['Crime'] });

function overlay(navigationState: Partial<DetailNavigation> = {}, collectionState: object = {}) {
  const navigation = {
    selectedId: 'movie-1',
    detail: null,
    loading: false,
    error: null,
    backTo: undefined,
    returnedHere: null,
    select: vi.fn(),
    retry: vi.fn(),
    back: vi.fn(),
    openRelated: vi.fn(),
    ...navigationState,
  } as DetailNavigation;
  const collections = {
    collections: BUILT_IN_COLLECTIONS,
    assignments: {},
    status: 'ready',
    collectionsFor: () => BUILT_IN_COLLECTIONS.slice(0, 2),
    toggleCollection: vi.fn(),
    createCollection: vi.fn(),
    ...collectionState,
  } as unknown as ReturnType<typeof useCollections>;
  const onSearchTerm = vi.fn();
  const onToggleFavorite = vi.fn();
  const view = render(
    <DetailOverlay
      navigation={navigation}
      title="Heat"
      collections={collections}
      isFavorite={() => false}
      onToggleFavorite={onToggleFavorite}
      onSearchTerm={onSearchTerm}
    />,
  );
  return { navigation, collections, onSearchTerm, onToggleFavorite, ...view };
}

describe('DetailOverlay', () => {
  it('renders nothing with no title selected', () => {
    const { container } = overlay({ selectedId: null });
    expect(container.firstChild).toBeNull();
  });

  it('shows the loading dialog until the detail arrives', () => {
    overlay({ loading: true });
    expect(screen.getByRole('dialog', { name: 'Loading details' })).toBeTruthy();
  });

  it('shows a failure naming the title known from the card, with retry and close', () => {
    const { navigation } = overlay({ error: { message: 'Slow', retryable: true } });
    expect(screen.getByRole('heading', { name: 'Couldn’t load “Heat”' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(navigation.retry).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(navigation.select).toHaveBeenCalledWith(null);
  });

  it('offers Back from a failed related title', () => {
    const { navigation } = overlay({ error: { message: 'Slow', retryable: true }, backTo: 'The Artist' });
    fireEvent.click(screen.getByRole('button', { name: 'Back to The Artist' }));
    expect(navigation.back).toHaveBeenCalled();
  });

  it('shows the detail, closing through navigation', () => {
    const { navigation } = overlay({ detail: item });
    expect(screen.getByRole('dialog', { name: 'Heat' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(navigation.select).toHaveBeenCalledWith(null);
  });

  it('a genre search closes the detail and runs the search', () => {
    const { navigation, onSearchTerm } = overlay({ detail: item });
    fireEvent.click(screen.getByRole('button', { name: 'Crime' }));
    expect(onSearchTerm).toHaveBeenCalledWith('genre: Crime');
    expect(navigation.select).toHaveBeenCalledWith(null);
  });

  it('applies collection changes to this title, showing what it is in', () => {
    const { collections } = overlay({ detail: item }, { assignments: { 'movie-1': ['to-watch'] } });
    fireEvent.click(screen.getByRole('button', { name: /^Collections/ }));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'To Watch' }).checked).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Watched' }));
    expect(collections.toggleCollection).toHaveBeenCalledWith(item, 'watched');
  });

  it('keeps creating a collection disabled until collections have loaded', () => {
    overlay({ detail: item }, { status: 'loading' });
    fireEvent.click(screen.getByRole('button', { name: /^Collections/ }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'New collection' }).disabled).toBe(true);
  });

  it('passes kept albums and the opened card on return', () => {
    const artist = contentItem('music-a', { type: 'music', musicKind: 'artist', title: 'The Artist' });
    const album = contentItem('music-b', { type: 'music', title: 'The Album' });
    overlay({
      detail: artist,
      selectedId: 'music-a',
      returnedHere: { id: 'music-a', item: artist, albums: [album], openedId: 'music-b' },
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'The Album' }));
  });

  it('opens a related title through navigation', () => {
    const artist = contentItem('music-a', { type: 'music', musicKind: 'artist', title: 'The Artist' });
    const album = contentItem('music-b', { type: 'music', title: 'The Album' });
    const { navigation } = overlay({
      detail: artist,
      returnedHere: { id: 'music-a', item: artist, albums: [album], openedId: 'music-b' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'The Album' }));
    expect(navigation.openRelated).toHaveBeenCalledWith('music-b', [album]);
  });
});
