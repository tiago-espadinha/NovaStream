// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ContentCard } from '../../src/components/ContentCard/ContentCard';
import { media } from '../helpers/fixtures';

const item = media('movie-1', { title: 'Heat', releaseYear: 1995, rating: 8.3 });

function card(overrides: Partial<ComponentProps<typeof ContentCard>> = {}) {
  return render(
    <ContentCard item={item} favorite={false} onToggleFavorite={() => {}} onSelect={() => {}} {...overrides} />,
  );
}

describe('ContentCard', () => {
  it('opens the title from its name, in a heading one level below the list', () => {
    const onSelect = vi.fn();
    card({ onSelect });
    expect(screen.getByRole('heading', { level: 3, name: 'Heat' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Heat' }));
    expect(onSelect).toHaveBeenCalledWith('movie-1');
  });

  it('can sit one heading level lower, under a shelf title', () => {
    card({ headingLevel: 4 });
    expect(screen.getByRole('heading', { level: 4, name: 'Heat' })).toBeTruthy();
  });

  it('has a save toggle that names the title and reports its state', () => {
    const onToggleFavorite = vi.fn();
    const { rerender } = card({ onToggleFavorite });
    const save = screen.getByRole('button', { name: 'Save Heat' });
    expect(save.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(save);
    expect(onToggleFavorite).toHaveBeenCalledWith(item);

    rerender(<ContentCard item={item} favorite onToggleFavorite={onToggleFavorite} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Save Heat' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the type, year and rating, and an artist when there is one', () => {
    card({ item: { ...item, artist: 'The Band' } });
    expect(screen.getByText('Movie')).toBeTruthy();
    expect(screen.getByText('1995')).toBeTruthy();
    expect(screen.getByText('8.3')).toBeTruthy();
    expect(screen.getByText('The Band')).toBeTruthy();
  });

  it('uses the poster as decoration, or a generated panel when there is none', () => {
    const { container, unmount } = card({ item: { ...item, posterUrl: 'https://img/heat.jpg' } });
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
    unmount();

    const fallback = card().container.querySelector<HTMLElement>('.card-fallback');
    expect(fallback?.style.background).toContain('linear-gradient');
    expect(fallback?.querySelector('[aria-hidden="true"]')?.textContent).toBe('Heat');
  });

  it('offers collection checkboxes on saved cards, with a running count', () => {
    const onToggleCollection = vi.fn();
    card({
      collectionIds: ['to-watch'],
      collectionOptions: [
        { id: 'to-watch', name: 'To Watch' },
        { id: 'watched', name: 'Watched' },
      ],
      onToggleCollection,
    });
    expect(screen.getByText('Collections · 1')).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'To Watch' }).checked).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Watched' }));
    expect(onToggleCollection).toHaveBeenCalledWith('watched');
  });

  it('has no collection menu without options or a handler', () => {
    const { unmount } = card({ collectionOptions: [], onToggleCollection: () => {} });
    expect(screen.queryByText('Collections')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    unmount();

    card({ collectionOptions: [{ id: 'to-watch', name: 'To Watch' }] });
    expect(screen.queryByText('Collections')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
