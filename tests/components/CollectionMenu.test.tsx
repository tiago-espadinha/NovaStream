// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionMenu } from '../../src/screens/detail/CollectionMenu';
import { BUILT_IN_COLLECTIONS, type SavedCollection } from '../../src/utils/collections';

const statuses = BUILT_IN_COLLECTIONS.filter(({ contentTypes }) => contentTypes.includes('movie'));
const mine: SavedCollection = { id: 'mine', name: 'Rainy Sundays', contentTypes: ['movie'] };
const collections = [...statuses, mine];

const onToggleCollection = vi.fn();
const onCreateCollection = vi.fn();

function menu(overrides: Partial<ComponentProps<typeof CollectionMenu>> = {}) {
  return render(
    <CollectionMenu
      itemType="movie"
      collections={collections}
      allCollections={collections}
      collectionIds={[]}
      ready
      onToggleCollection={onToggleCollection}
      onCreateCollection={onCreateCollection}
      {...overrides}
    />,
  );
}

const trigger = () => screen.getByRole('button', { name: /^Collections/ });
const popover = () => screen.queryByRole('group', { name: 'Collections for this title' });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('CollectionMenu', () => {
  it('is closed until asked for, with the trigger reporting its state', () => {
    menu();
    expect(popover()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger());
    expect(popover()).not.toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-controls')).toBe(popover()!.id);
  });

  it('counts only the collections on this format', () => {
    menu({ collectionIds: ['to-watch', 'to-read'] });
    expect(trigger().textContent).toContain('1 selected');
  });

  it('separates statuses from the user’s own and reports a toggle', () => {
    menu({ collectionIds: ['watched'] });
    fireEvent.click(trigger());
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Watched' }).checked).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Rainy Sundays' }));
    expect(onToggleCollection).toHaveBeenCalledWith('mine');
    fireEvent.click(screen.getByRole('checkbox', { name: 'To Watch' }));
    expect(onToggleCollection).toHaveBeenCalledWith('to-watch');
  });

  it('says when none of the user’s collections cover this format', () => {
    menu({ collections: statuses });
    fireEvent.click(trigger());
    expect(screen.getByText('None cover this format yet.')).toBeTruthy();
  });

  it('links to the Saved page to manage collections', () => {
    menu();
    fireEvent.click(trigger());
    expect(screen.getByRole('link', { name: 'Manage collections in Saved' }).getAttribute('href')).toBe('/saved');
  });

  it('closes on an outside press, but not on one inside', () => {
    menu();
    fireEvent.click(trigger());
    fireEvent.pointerDown(popover()!);
    expect(popover()).not.toBeNull();

    fireEvent.pointerDown(document.body);
    expect(popover()).toBeNull();
  });

  it('Escape closes only the menu and returns focus to the trigger', () => {
    const onDialogKey = vi.fn();
    render(
      // Stands in for the detail dialog around it, which must not hear this Escape.
      <div onKeyDown={onDialogKey}>
        <CollectionMenu
          itemType="movie"
          collections={collections}
          allCollections={collections}
          collectionIds={[]}
          ready
          onToggleCollection={onToggleCollection}
          onCreateCollection={onCreateCollection}
        />
      </div>,
    );
    fireEvent.click(trigger());
    fireEvent.keyDown(within(popover()!).getByRole('checkbox', { name: 'Watched' }), { key: 'Escape' });
    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(onDialogKey).not.toHaveBeenCalled();

    fireEvent.keyDown(trigger(), { key: 'Escape' });
    expect(onDialogKey).toHaveBeenCalledTimes(1);
  });

  it('cannot create until the account has loaded', () => {
    menu({ ready: false });
    fireEvent.click(trigger());
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'New collection' }).disabled).toBe(true);
  });

  it('opens the form on request, and cancel returns focus to the button', () => {
    menu();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: 'New collection' }));
    expect(screen.getByRole('form', { name: 'New collection' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New collection' }));
  });

  it('confirms a new collection, saying whether the title went in', () => {
    onCreateCollection.mockReturnValue({ id: 'c1', name: 'Noir', contentTypes: ['movie'] });
    menu();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: 'New collection' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Noir' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create and add' }));

    expect(onCreateCollection).toHaveBeenCalledWith('Noir', expect.arrayContaining(['movie']));
    expect(screen.getByText('Created “Noir” and added this title.')).toBeTruthy();
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('forgets the form and the confirmation when closed', () => {
    onCreateCollection.mockReturnValue({ id: 'c1', name: 'Noir', contentTypes: ['book'] });
    menu({ itemType: 'book' });
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: 'New collection' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Noir' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create and add' }));
    expect(screen.getByText('Created “Noir” and added this title.')).toBeTruthy();

    fireEvent.click(trigger());
    fireEvent.click(trigger());
    expect(screen.queryByText(/Created/)).toBeNull();
  });
});
