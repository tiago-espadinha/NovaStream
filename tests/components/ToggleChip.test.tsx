// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChipText, ToggleChip } from '../../src/components/ToggleChip/ToggleChip';

describe('ToggleChip', () => {
  it('is a real checkbox named by its label, reflecting its state', () => {
    const { rerender } = render(<ToggleChip label="Movies" checked={false} onChange={() => {}} />);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Movies' }).checked).toBe(false);

    rerender(<ToggleChip label="Movies" checked onChange={() => {}} />);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Movies' }).checked).toBe(true);
  });

  it('reports a click on the chip', () => {
    const onChange = vi.fn();
    render(<ToggleChip label="Movies" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByText('Movies'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('ChipText', () => {
  it('copies its label to an attribute, which reserves the bold width', () => {
    render(<ChipText label="Movies" />);
    expect(screen.getByText('Movies').getAttribute('data-label')).toBe('Movies');
  });
});
