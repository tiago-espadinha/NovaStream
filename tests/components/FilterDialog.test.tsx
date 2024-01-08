// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FilterDialog } from '../../src/screens/home/FilterDialog';

function dialog(overrides: Partial<ComponentProps<typeof FilterDialog>> = {}) {
  const handlers = {
    onToggleCategory: vi.fn(),
    onToggleGenre: vi.fn(),
    onMusicKindChange: vi.fn(),
    onMinRatingChange: vi.fn(),
    onMinPlaysChange: vi.fn(),
    onReset: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <FilterDialog
      showCategories
      selectedCategories={['movie', 'music']}
      genreGroups={[
        { type: 'movie', genres: ['Drama', 'Action'] },
        { type: 'music', genres: ['Rock'] },
      ]}
      selectedGenres={[{ type: 'movie', genre: 'Drama' }]}
      showMusicKind
      musicKind="album"
      showRating
      minRating={0}
      showPlays
      minPlays={0}
      playsRange={{ max: 1000, step: 10 }}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('FilterDialog', () => {
  it('is a labelled dialog, focusing its first control', () => {
    dialog();
    expect(screen.getByRole('dialog', { name: 'Filter results' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close filters' }));
  });

  it('closes from each way out', () => {
    const { onClose } = dialog();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show results' }));
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it('ticks the selected categories and reports a change', () => {
    const { onToggleCategory } = dialog();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Movies' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Books' }).checked).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Books' }));
    expect(onToggleCategory).toHaveBeenCalledWith('book');
  });

  it('hides categories under a type tab', () => {
    dialog({ showCategories: false });
    expect(screen.queryByRole('group', { name: 'Categories' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('groups genres by format, pressed per format', () => {
    const { onToggleGenre } = dialog();
    const movies = within(screen.getByRole('group', { name: 'Movies genres' }));
    expect(movies.getByRole('button', { name: 'Drama' }).getAttribute('aria-pressed')).toBe('true');
    expect(movies.getByRole('button', { name: 'Action' }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(within(screen.getByRole('group', { name: 'Music genres' })).getByRole('button', { name: 'Rock' }));
    expect(onToggleGenre).toHaveBeenCalledWith('music', 'Rock');
  });

  it('offers music kinds, pressing the current one', () => {
    const { onMusicKindChange } = dialog();
    const kinds = within(screen.getByRole('group', { name: 'Music type' }));
    expect(kinds.getByRole('button', { name: 'Albums' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(kinds.getByRole('button', { name: 'All kinds' }));
    expect(onMusicKindChange).toHaveBeenCalledWith('all');
  });

  it('speaks the sliders in words, reporting numbers', () => {
    const { onMinRatingChange, onMinPlaysChange } = dialog();
    const rating = screen.getByRole('slider', { name: /Minimum rating/ });
    const plays = screen.getByRole('slider', { name: /Minimum plays/ });
    expect(rating.getAttribute('aria-valuetext')).toBe('Any rating');
    expect(plays.getAttribute('aria-valuetext')).toBe('Any play count');
    expect(plays.getAttribute('max')).toBe('1000');
    expect(plays.getAttribute('step')).toBe('10');

    fireEvent.change(rating, { target: { value: '7.5' } });
    expect(onMinRatingChange).toHaveBeenCalledWith(7.5);
    fireEvent.change(plays, { target: { value: '500' } });
    expect(onMinPlaysChange).toHaveBeenCalledWith(500);
  });

  it('words set values', () => {
    dialog({ minRating: 7.5, minPlays: 1000 });
    expect(screen.getByRole('slider', { name: /Minimum rating/ }).getAttribute('aria-valuetext')).toBe('7.5 or higher');
    expect(screen.getByText('7.5+')).toBeTruthy();
    expect(screen.getByRole('slider', { name: /Minimum plays/ }).getAttribute('aria-valuetext')).toBe(
      '1,000 plays or more',
    );
    expect(screen.getByText('1,000+')).toBeTruthy();
  });

  it('leaves out what does not apply', () => {
    dialog({ showMusicKind: false, showRating: false, showPlays: false });
    expect(screen.queryByRole('group', { name: 'Music type' })).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('resets', () => {
    const { onReset } = dialog();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(onReset).toHaveBeenCalled();
  });
});
