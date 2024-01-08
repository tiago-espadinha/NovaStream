// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Spotlight } from '../../src/screens/home/Spotlight';
import { media } from '../helpers/fixtures';

const item = {
  ...media('movie-1', { title: 'Heat', genres: ['Crime', 'Drama', 'Thriller'], releaseYear: 1995 }),
  overview: 'A heist.',
};

function spotlight(favorite = false, overrides = {}) {
  const onToggleFavorite = vi.fn();
  const onExplore = vi.fn();
  const view = render(
    <Spotlight
      item={{ ...item, ...overrides }}
      favorite={favorite}
      onToggleFavorite={onToggleFavorite}
      onExplore={onExplore}
    />,
  );
  return { onToggleFavorite, onExplore, ...view };
}

describe('Spotlight', () => {
  it('is a section named by the title, with its details', () => {
    spotlight();
    expect(screen.getByRole('region', { name: 'Heat' })).toBeTruthy();
    expect(screen.getByText('Featured after dark · Movie')).toBeTruthy();
    expect(screen.getByText('1995')).toBeTruthy();
    expect(screen.getByText('Crime / Drama')).toBeTruthy();
    expect(screen.getByText('A heist.')).toBeTruthy();
  });

  it('opens the title from Explore', () => {
    const { onExplore } = spotlight();
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }));
    expect(onExplore).toHaveBeenCalledWith('movie-1');
  });

  it('toggles the favorite, showing its state', () => {
    const { onToggleFavorite, unmount } = spotlight();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(save);
    expect(onToggleFavorite).toHaveBeenCalled();
    unmount();

    spotlight(true);
    expect(screen.getByRole('button', { name: 'Saved' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('describes a poster, or uses a decorative panel without one', () => {
    const { container, unmount } = spotlight();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.spotlight-fallback')?.getAttribute('aria-hidden')).toBe('true');
    unmount();

    spotlight(false, { posterUrl: 'https://img/heat.jpg' });
    expect(screen.getByRole('img', { name: 'Heat artwork' })).toBeTruthy();
  });

  it('leaves out what it does not have', () => {
    const { container } = spotlight(false, { overview: undefined, genres: [], releaseYear: null });
    expect(container.querySelector('.spotlight-synopsis')).toBeNull();
    expect(container.querySelector('.spotlight-meta')?.querySelectorAll(':scope > span').length).toBe(1);
  });
});
