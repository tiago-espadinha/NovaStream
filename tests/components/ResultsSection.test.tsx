// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ContentFilters } from '../../src/hooks/useContentFilters';
import type { HomeShelves } from '../../src/hooks/useHomeShelves';
import type { LiveSearch } from '../../src/hooks/useLiveSearch';
import { ResultsSection } from '../../src/screens/home/ResultsSection';
import { media } from '../helpers/fixtures';

const heat = media('movie-1', { title: 'Heat' });
const emma = media('book-1', { type: 'book', title: 'Emma' });

function section({
  search = {},
  filters = {},
  shelves = {},
  ...props
}: {
  search?: Partial<LiveSearch>;
  filters?: Partial<ContentFilters>;
  shelves?: Partial<HomeShelves>;
} & Omit<Partial<ComponentProps<typeof ResultsSection>>, 'search' | 'filters' | 'shelves'> = {}) {
  const handlers = { onSelect: vi.fn(), onClearQuery: vi.fn(), onOpenFilters: vi.fn(), onToggleFavorite: vi.fn() };
  const retry = vi.fn();
  const reset = vi.fn();
  const setSortBy = vi.fn();
  render(
    <ResultsSection
      trimmedQuery=""
      awaitingLiveQuery={false}
      activeType="all"
      search={{ results: [], loading: false, error: null, failed: false, retry, ...search } as LiveSearch}
      filters={
        { displayedItems: [heat], activeCount: 0, sortBy: 'featured', setSortBy, reset, ...filters } as ContentFilters
      }
      shelves={
        {
          showShelves: false,
          shelfItems: [heat],
          mixedShelf: [],
          typeShelves: [],
          ...shelves,
        } as unknown as HomeShelves
      }
      isFavorite={() => false}
      {...handlers}
      {...props}
    />,
  );
  return { ...handlers, retry, reset, setSortBy };
}

const heading = () => screen.getByRole('heading', { level: 2 });

describe('ResultsSection heading', () => {
  it('names a browse, a tab, a search and a keyword search', () => {
    section();
    expect(heading().textContent).toBe('Browse tonight');
  });

  it('names a type tab', () => {
    section({ activeType: 'book' });
    expect(heading().textContent).toBe('Books');
  });

  it('names a text search', () => {
    section({ trimmedQuery: 'heat' });
    expect(heading().textContent).toBe('Results for “heat”');
  });

  it('shows a keyword search as a chip', () => {
    section({ trimmedQuery: 'genre: Drama' });
    expect(heading().querySelector('.keyword-chip')?.textContent).toContain('Drama');
  });

  it('can take focus when a closing dialog has lost its opener', () => {
    section();
    expect(heading().getAttribute('data-focus-fallback')).not.toBeNull();
  });
});

describe('ResultsSection states', () => {
  it('before a live search, asks for one and has no toolbar or count', () => {
    section({ awaitingLiveQuery: true });
    expect(heading().textContent).toBe('Search to get started');
    expect(screen.getByText(/Type in the search box above/)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Filter' })).toBeNull();
    expect(screen.queryByText('1 title')).toBeNull();
  });

  it('while searching, shows a spinner and no count', () => {
    section({ search: { loading: true } });
    expect(screen.getByText('Searching live databases…')).toBeTruthy();
    expect(screen.queryByText('1 title')).toBeNull();
  });

  it('a failed search interrupts screen readers and offers retry and clear', () => {
    const { retry, onClearQuery } = section({
      trimmedQuery: 'heat',
      search: { failed: true, error: { message: 'Down', retryable: true } },
    });
    expect(screen.getByRole('alert').textContent).toBe('Down');
    expect(screen.queryByRole('button', { name: 'Filter' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onClearQuery).toHaveBeenCalled();
  });

  it('a partial outage is a quiet status, above the results', () => {
    section({ search: { failed: false, error: { message: 'Books are down', retryable: false } } });
    expect(screen.getByRole('status').textContent).toBe('Books are down');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Heat' })).toBeTruthy();
  });

  it('with no matches, names the search and offers to clear it', () => {
    const { onClearQuery } = section({ trimmedQuery: 'zzz', filters: { displayedItems: [] } });
    expect(screen.getByText('No matches for “zzz”.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset filters' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onClearQuery).toHaveBeenCalled();
  });

  it('when filters hide everything, offers to reset them', () => {
    const { reset } = section({ filters: { displayedItems: [], activeCount: 2 } });
    expect(screen.getByText('No titles match these filters.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(reset).toHaveBeenCalled();
  });
});

describe('ResultsSection results', () => {
  it('lists a grid and counts it', () => {
    const { onSelect } = section();
    expect(screen.getByText('1 title')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Heat' }));
    expect(onSelect).toHaveBeenCalledWith('movie-1');
  });

  it('shows the mix and one shelf per type when browsing', () => {
    section({
      shelves: { showShelves: true, mixedShelf: [heat], typeShelves: [{ type: 'book', items: [emma] }] },
    });
    expect(
      within(screen.getByRole('region', { name: 'Tonight’s mix' })).getByRole('button', { name: 'Heat' }),
    ).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Books' })).getByRole('button', { name: 'Emma' })).toBeTruthy();
  });

  it('reports a sort choice, wording the default for a search', () => {
    const { setSortBy } = section({ trimmedQuery: 'heat' });
    const sort = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Sort' });
    expect(sort.options[0].textContent).toBe('Best match');
    fireEvent.change(sort, { target: { value: 'rating' } });
    expect(setSortBy).toHaveBeenCalledWith('rating');
  });

  it('opens the filters, counting those active', () => {
    const { onOpenFilters } = section({ filters: { displayedItems: [heat], activeCount: 3 } });
    fireEvent.click(screen.getByRole('button', { name: 'Filter · 3' }));
    expect(onOpenFilters).toHaveBeenCalled();
  });
});
