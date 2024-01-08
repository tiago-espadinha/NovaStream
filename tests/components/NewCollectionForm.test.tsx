// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewCollectionForm } from '../../src/screens/detail/NewCollectionForm';
import { CONTENT_TYPES } from '../../src/types';
import { BUILT_IN_COLLECTIONS, type SavedCollection } from '../../src/utils/collections';

const onCreate = vi.fn();
const onCancel = vi.fn();
const onCreated = vi.fn();

function form(overrides: Partial<ComponentProps<typeof NewCollectionForm>> = {}) {
  return render(
    <NewCollectionForm
      itemType="movie"
      allCollections={BUILT_IN_COLLECTIONS}
      onCreate={onCreate}
      onCancel={onCancel}
      onCreated={onCreated}
      {...overrides}
    />,
  );
}

const name = () => screen.getByLabelText('Name');
const submit = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Create and add' });
const typeName = (value: string) => fireEvent.change(name(), { target: { value } });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('NewCollectionForm', () => {
  it('focuses the name, starts on all formats, and waits for a name', () => {
    form();
    expect(document.activeElement).toBe(name());
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'All formats' }).checked).toBe(true);
    expect(submit().disabled).toBe(true);
    expect(screen.getByText('Up to 32 characters.')).toBeTruthy();
  });

  it('creates with the name and formats, then reports back', () => {
    const created: SavedCollection = { id: 'c1', name: 'Noir', contentTypes: CONTENT_TYPES };
    onCreate.mockReturnValue(created);
    form();
    typeName('Noir');
    fireEvent.click(submit());
    expect(onCreate).toHaveBeenCalledWith('Noir', CONTENT_TYPES);
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it('flags a duplicate name on the field', () => {
    form();
    typeName('watched');
    expect(screen.getByText('You already have a collection called “Watched”.')).toBeTruthy();
    expect(name().getAttribute('aria-invalid')).toBe('true');
    expect(submit().disabled).toBe(true);
  });

  it('insists on the format of the title being organized', () => {
    form();
    typeName('Noir');
    fireEvent.click(screen.getByRole('checkbox', { name: 'All formats' }));
    expect(screen.getByText('Pick at least one format.')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Books' }));
    expect(screen.getByText('Include Movies so this title can be added.')).toBeTruthy();
    expect(submit().disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Movies' }));
    expect(submit().disabled).toBe(false);
  });

  it('explains the limit, sending people to Saved', () => {
    const full = Array.from({ length: 50 }, (_, index): SavedCollection => ({
      id: `c${index}`,
      name: `C${index}`,
      contentTypes: ['movie'],
    }));
    form({ allCollections: [...BUILT_IN_COLLECTIONS, ...full] });
    typeName('Noir');
    expect(screen.getByText('You can have up to 50 collections. Delete one in Saved to add another.')).toBeTruthy();
    expect(submit().disabled).toBe(true);
  });

  it('stays open when creation fails, until the name changes', () => {
    onCreate.mockReturnValue(null);
    form();
    typeName('Noir');
    fireEvent.click(submit());
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByText('Your collections aren’t available right now.')).toBeTruthy();

    typeName('Noir 2');
    expect(screen.queryByText('Your collections aren’t available right now.')).toBeNull();
  });

  it('cancels without creating', () => {
    form();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
