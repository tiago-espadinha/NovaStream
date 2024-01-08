// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormatChips } from '../../src/components/FormatChips/FormatChips';
import { CONTENT_TYPES } from '../../src/types';

const chip = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name });

describe('FormatChips', () => {
  it('shows the shortcut and one chip per format, ticked by selection', () => {
    render(<FormatChips selected={['movie', 'book']} onChange={() => {}} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(CONTENT_TYPES.length + 1);
    expect(chip('All formats').checked).toBe(false);
    expect(chip('Movies').checked).toBe(true);
    expect(chip('Games').checked).toBe(false);
  });

  it('adds and removes one format', () => {
    const onChange = vi.fn();
    render(<FormatChips selected={['movie', 'book']} onChange={onChange} />);
    fireEvent.click(chip('Games'));
    expect(onChange).toHaveBeenLastCalledWith(['movie', 'book', 'game']);
    fireEvent.click(chip('Movies'));
    expect(onChange).toHaveBeenLastCalledWith(['book']);
  });

  it('the shortcut selects everything, or clears everything when all are selected', () => {
    const onChange = vi.fn();
    const { rerender } = render(<FormatChips selected={['movie']} onChange={onChange} />);
    fireEvent.click(chip('All formats'));
    expect(onChange).toHaveBeenLastCalledWith(CONTENT_TYPES);

    rerender(<FormatChips selected={CONTENT_TYPES} onChange={onChange} />);
    expect(chip('All formats').checked).toBe(true);
    fireEvent.click(chip('All formats'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
