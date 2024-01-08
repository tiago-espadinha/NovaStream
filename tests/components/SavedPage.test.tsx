// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SavedPage } from '../../src/screens/saved/SavedPage';
import { CONTENT_TYPES } from '../../src/types';
import type { SavedCollection } from '../../src/utils/collections';
import { media } from '../helpers/fixtures';

const toWatch: SavedCollection = { id: 'to-watch', name: 'To Watch', contentTypes: ['movie'], builtIn: true };
const mine: SavedCollection = { id: 'mine', name: 'Noir', contentTypes: ['movie'] };
const heat = media('movie-1', { title: 'Heat' });
const ronin = media('movie-2', { title: 'Ronin' });

function saved(overrides: Partial<ComponentProps<typeof SavedPage>> = {}) {
  const handlers = {
    onRetry: vi.fn(),
    onSignIn: vi.fn(),
    onToggleFavorite: vi.fn(),
    onSelect: vi.fn(),
    onCreateCollection: vi.fn(),
    deleteCollection: vi.fn(),
    toggleCollection: vi.fn(),
  };
  render(
    <SavedPage
      status="ready"
      signedIn
      favoriteItems={[heat]}
      collectionItems={[ronin]}
      isFavorite={(id) => id === 'movie-1'}
      collections={[toWatch, mine]}
      assignments={{ 'movie-2': ['mine'] }}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

const pick = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('SavedPage states', () => {
  it('hides counts and shows a spinner while loading, with creating disabled', () => {
    saved({ status: 'loading' });
    expect(screen.getByText('Loading your saved titles…')).toBeTruthy();
    expect(document.querySelector('.collection-count')).toBeNull();
    expect(screen.queryByText(/\d titles?/)).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveProperty('disabled', true);
    expect(screen.getByText('Collections are unavailable until your library loads.')).toBeTruthy();
  });

  it('never claims emptiness after a failed load, offering a retry', () => {
    const { onRetry } = saved({ status: 'error', favoriteItems: [], collectionItems: [] });
    expect(screen.getByRole('alert').textContent).toContain('Couldn’t load your saved titles.');
    expect(screen.queryByText(/will appear here/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('invites a guest with an empty library to sign in', () => {
    const { onSignIn } = saved({ signedIn: false, favoriteItems: [], collectionItems: [], assignments: {} });
    expect(screen.getByText(/As a guest, what you save stays in this browser/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSignIn).toHaveBeenCalled();
  });

  it('does not ask a signed-in user to sign in', () => {
    saved({ favoriteItems: [], collectionItems: [], assignments: {} });
    expect(screen.getByText(/Your saved titles will appear here/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('words each empty view for what it is showing', () => {
    saved({ favoriteItems: [] });
    expect(screen.getByText(/^No favorites yet/)).toBeTruthy();

    pick(/^To Watch/);
    expect(screen.getByText(/^Nothing in this collection yet/)).toBeTruthy();
  });
});

describe('SavedPage collections', () => {
  it('starts on Favorites, showing only favorites', () => {
    saved();
    expect(screen.getByRole('heading', { level: 2, name: 'Favorites' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Favorites/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Heat' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ronin' })).toBeNull();
  });

  it('counts the library without counting a title twice', () => {
    saved({ collectionItems: [heat, ronin] });
    expect(screen.getByText(/Your library/).textContent).toContain('2 titles');
  });

  it('switches to a collection, showing its titles and a count on each', () => {
    saved();
    const list = within(screen.getByRole('group', { name: 'Show collection' }));
    expect(list.getByRole('button', { name: /^Noir\s*1$/ })).toBeTruthy();
    expect(list.getByRole('button', { name: /^To Watch\s*0$/ })).toBeTruthy();

    pick(/^Noir/);
    expect(screen.getByRole('button', { name: /^Noir/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Ronin' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Heat' })).toBeNull();
  });

  it('lets a card change its collections, offering only those for its format', () => {
    const book = media('book-1', { type: 'book', title: 'Emma' });
    const { toggleCollection, onSelect, onToggleFavorite } = saved({
      favoriteItems: [heat, book],
      collections: [toWatch, mine],
    });
    const card = within(screen.getByRole('button', { name: 'Heat' }).closest('article')!);
    fireEvent.click(card.getByRole('checkbox', { name: 'To Watch' }));
    expect(toggleCollection).toHaveBeenCalledWith(heat, 'to-watch');

    const emma = screen.getByRole('button', { name: 'Emma' }).closest('article')!;
    expect(within(emma).queryByRole('checkbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Heat' }));
    expect(onSelect).toHaveBeenCalledWith('movie-1');
    fireEvent.click(screen.getByRole('button', { name: 'Save Heat' }));
    expect(onToggleFavorite).toHaveBeenCalledWith(heat);
  });

  it('can delete a custom collection but not a built-in one', () => {
    saved();
    pick(/^To Watch/);
    expect(screen.queryByRole('button', { name: /^Delete collection/ })).toBeNull();
    pick(/^Noir/);
    expect(screen.getByRole('button', { name: 'Delete collection Noir' })).toBeTruthy();
  });

  it('after deleting, returns to Favorites with focus on the list', () => {
    const { deleteCollection } = saved();
    pick(/^Noir/);
    fireEvent.click(screen.getByRole('button', { name: 'Delete collection Noir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteCollection).toHaveBeenCalledWith('mine');
    expect(screen.getByRole('heading', { level: 2, name: 'Favorites' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Favorites/ }));
  });
});

describe('SavedPage new collection', () => {
  const name = () => screen.getByLabelText('Name');
  const create = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Create collection' });

  it('waits for a name', () => {
    saved();
    expect(create().disabled).toBe(true);
    fireEvent.change(name(), { target: { value: 'Heist' } });
    expect(create().disabled).toBe(false);
  });

  it('refuses a duplicate name, saying why', () => {
    saved();
    fireEvent.change(name(), { target: { value: 'noir' } });
    expect(screen.getByText('You already have a collection called “Noir”.')).toBeTruthy();
    expect(name().getAttribute('aria-invalid')).toBe('true');
    expect(create().disabled).toBe(true);
  });

  it('requires a format', () => {
    saved();
    fireEvent.change(name(), { target: { value: 'Heist' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'All formats' }));
    expect(screen.getByText('Pick at least one format.')).toBeTruthy();
    expect(create().disabled).toBe(true);
  });

  it('creates it, trimmed, then opens it and resets the form', () => {
    const created: SavedCollection = { id: 'new', name: 'Heist', contentTypes: ['movie'] };
    const onCreateCollection = vi.fn(() => created);
    saved({ onCreateCollection, collections: [toWatch, mine] });
    fireEvent.change(name(), { target: { value: '  Heist ' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Books' }));
    fireEvent.submit(create().closest('form')!);

    expect(onCreateCollection).toHaveBeenCalledWith(
      'Heist',
      CONTENT_TYPES.filter((type) => type !== 'book'),
    );
    expect(name()).toHaveProperty('value', '');
    expect(screen.getByText('Created “Heist”.')).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'All formats' }).checked).toBe(true);
  });

  it('keeps what was typed when creating fails', () => {
    const { onCreateCollection } = saved();
    onCreateCollection.mockReturnValue(null);
    fireEvent.change(name(), { target: { value: 'Heist' } });
    fireEvent.submit(create().closest('form')!);
    expect(name()).toHaveProperty('value', 'Heist');
  });
});
