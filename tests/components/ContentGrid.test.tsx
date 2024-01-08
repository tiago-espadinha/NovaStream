// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContentGrid } from '../../src/components/ContentGrid/ContentGrid';
import { media } from '../helpers/fixtures';

describe('ContentGrid', () => {
  it('says so when there is nothing to show, instead of an empty list', () => {
    render(<ContentGrid items={[]} isFavorite={() => false} onToggleFavorite={() => {}} onSelect={() => {}} />);
    expect(screen.getByText('No matches. Try a different search or category.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('lists one card per title, each knowing its own favorite state and handlers', () => {
    const onSelect = vi.fn();
    const onToggleFavorite = vi.fn();
    const heat = media('movie-1', { title: 'Heat' });
    render(
      <ContentGrid
        items={[heat, media('movie-2', { title: 'Ronin' })]}
        isFavorite={(id) => id === 'movie-2'}
        onToggleFavorite={onToggleFavorite}
        onSelect={onSelect}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Save Ronin' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Save Heat' }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Heat' }));
    expect(onSelect).toHaveBeenCalledWith('movie-1');
    fireEvent.click(screen.getByRole('button', { name: 'Save Heat' }));
    expect(onToggleFavorite).toHaveBeenCalledWith(heat);
  });
});
