// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ContentFilters } from '../../src/hooks/useContentFilters';
import type { HomeShelves } from '../../src/hooks/useHomeShelves';
import type { LiveSearch } from '../../src/hooks/useLiveSearch';
import type { useTrending } from '../../src/hooks/useTrending';
import { HomeScreen } from '../../src/screens/home/HomeScreen';
import { media } from '../helpers/fixtures';

const heat = media('movie-1', { title: 'Heat' });

function home({
  shelves = {},
  trending = {},
  filters = {},
  ...props
}: {
  shelves?: Partial<HomeShelves>;
  trending?: Partial<ReturnType<typeof useTrending>>;
  filters?: Partial<ContentFilters>;
} & Omit<Partial<ComponentProps<typeof HomeScreen>>, 'shelves' | 'trending' | 'filters'> = {}) {
  const onSelect = vi.fn();
  const retry = vi.fn();
  const setMinRating = vi.fn();
  render(
    <HomeScreen
      notices={[]}
      trimmedQuery=""
      awaitingLiveQuery={false}
      activeType="all"
      search={{ results: [], loading: false, error: null, failed: false, retry: () => {} } as LiveSearch}
      filters={
        {
          displayedItems: [],
          activeCount: 0,
          sortBy: 'featured',
          selectedCategories: [],
          selectedGenres: [],
          activeCategories: ['movie', 'music'],
          genreGroups: [],
          musicKind: 'all',
          minRating: 0,
          minPlays: 0,
          playsRange: { max: 100, step: 1 },
          setMinRating,
          ...filters,
        } as unknown as ContentFilters
      }
      shelves={
        {
          spotlight: null,
          favoritesShelf: [],
          showTrending: false,
          trendingItems: [],
          trendingFailed: false,
          showShelves: false,
          shelfItems: [],
          mixedShelf: [],
          typeShelves: [],
          ...shelves,
        } as HomeShelves
      }
      trending={{ items: [], loading: false, problem: null, retry, ...trending }}
      savedCount={0}
      isFavorite={() => false}
      onToggleFavorite={() => {}}
      onSelect={onSelect}
      onClearQuery={() => {}}
      {...props}
    />,
  );
  return { onSelect, retry, setMinRating };
}

describe('HomeScreen', () => {
  it('is the main landmark, with a page heading and the skip target', () => {
    home();
    const main = screen.getByRole('main');
    expect(main.id).toBe('main-content');
    expect(within(main).getByRole('heading', { level: 1 }).textContent).toBe(
      'Discover films, series, music, books and games',
    );
  });

  it('shows the notices it is given', () => {
    home({ notices: [{ id: 'n', message: 'Hello', tone: 'success', onDismiss: () => {} }] });
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('introduces live search only while waiting for a query', () => {
    home({ awaitingLiveQuery: true });
    expect(screen.getByRole('region', { name: 'Find your next obsession.' })).toBeTruthy();
  });

  it('shows the spotlight when there is one, opening it from Explore', () => {
    const { onSelect } = home({ shelves: { spotlight: heat } });
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }));
    expect(onSelect).toHaveBeenCalledWith('movie-1');
  });

  it('shows favorites with a link to all of them, counted', () => {
    home({ shelves: { favoritesShelf: [heat] }, savedCount: 9 });
    const shelf = within(screen.getByRole('region', { name: 'Your favorites' }));
    const link = shelf.getByRole('link');
    expect(link.getAttribute('href')).toBe('/saved');
    expect(link.textContent).toContain('See all in Saved');
    expect(link.textContent).toContain('9 favorites');
  });

  it('leaves out the favorites and trending shelves when they have nothing', () => {
    home();
    expect(screen.queryByRole('region', { name: 'Your favorites' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Trending this week' })).toBeNull();
  });

  it('shows trending loading', () => {
    home({ shelves: { showTrending: true }, trending: { loading: true } });
    expect(screen.getByText('Loading what’s trending…')).toBeTruthy();
  });

  it('retries a failed feed, keeping focus on the shelf heading', () => {
    const { retry } = home({
      shelves: { showTrending: true, trendingFailed: true },
      trending: { problem: { message: 'Down', retryable: true } },
    });
    const shelf = screen.getByRole('region', { name: 'Trending this week' });
    expect(shelf.querySelector('.notice-error')?.textContent).toContain('Down');

    fireEvent.click(within(shelf).getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Trending this week' }));
  });

  it('shows a partial feed with a warning, and no retry when it cannot help', () => {
    home({
      shelves: { showTrending: true, trendingItems: [heat] },
      trending: { problem: { message: 'Books are down', retryable: false } },
    });
    const shelf = screen.getByRole('region', { name: 'Trending this week' });
    expect(shelf.querySelector('.notice-warning')?.textContent).toContain('Books are down');
    expect(within(shelf).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(within(shelf).getByRole('button', { name: 'Heat' })).toBeTruthy();
  });

  it('opens and closes the filters', () => {
    home();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.getByRole('dialog', { name: 'Filter results' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show results' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('fits the filters to what is showing: categories on All, plays with music, rating without', () => {
    home({ filters: { activeCategories: ['music'] } });
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
    expect(screen.getByRole('slider', { name: /Minimum plays/ })).toBeTruthy();
    expect(screen.queryByRole('slider', { name: /Minimum rating/ })).toBeNull();
  });

  it('has no categories under a type tab, and rating without music', () => {
    const { setMinRating } = home({ activeType: 'movie', filters: { activeCategories: ['movie'] } });
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('slider', { name: /Minimum plays/ })).toBeNull();

    fireEvent.change(screen.getByRole('slider', { name: /Minimum rating/ }), { target: { value: '8' } });
    expect(setMinRating).toHaveBeenCalledWith(8);
  });
});
