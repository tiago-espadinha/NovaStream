// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TypeNav } from '../../src/components/TypeNav/TypeNav';

describe('TypeNav', () => {
  it('is a labelled navigation with All and each format', () => {
    render(<TypeNav active="all" onChange={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Media type' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['All', 'Movies', 'TV', 'Music', 'Books', 'Games']);
  });

  it('marks only the active type as pressed', () => {
    render(<TypeNav active="tv" onChange={() => {}} />);
    const pressed = screen.getAllByRole('button').filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((button) => button.textContent)).toEqual(['TV']);
  });

  it('reports the chosen type', () => {
    const onChange = vi.fn();
    render(<TypeNav active="tv" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onChange).toHaveBeenCalledWith('all');
    fireEvent.click(screen.getByRole('button', { name: 'Games' }));
    expect(onChange).toHaveBeenCalledWith('game');
  });
});
