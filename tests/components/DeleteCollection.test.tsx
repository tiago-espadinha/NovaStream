// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteCollection } from '../../src/screens/saved/DeleteCollection';

function bin() {
  const onDelete = vi.fn();
  render(<DeleteCollection name="Noir" onDelete={onDelete} />);
  return onDelete;
}

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Delete collection Noir' }));

describe('DeleteCollection', () => {
  it('asks in a modal before anything is deleted', () => {
    const onDelete = bin();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    open();
    expect(screen.getByRole('alertdialog', { name: 'Delete “Noir”?' })).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('starts on Cancel, so Enter cannot delete by accident', () => {
    bin();
    open();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('deletes on confirmation', () => {
    const onDelete = bin();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Cancel', () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['the backdrop', () => fireEvent.click(screen.getByRole('alertdialog').parentElement!)],
  ])('backs out with %s, returning focus to the bin', (_label, leave) => {
    const onDelete = bin();
    screen.getByRole('button', { name: 'Delete collection Noir' }).focus();
    open();
    leave();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete collection Noir' }));
  });
});
