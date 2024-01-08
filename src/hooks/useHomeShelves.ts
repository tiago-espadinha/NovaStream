import { useMemo, useState } from 'react';
import { USE_MOCK } from '../config';
import { mockTrending } from '../data/mockData';
import type { ContentItem, ContentType, MediaSummary } from '../types';
import { groupByType, mixAcrossTypes, pickSpotlight, sampleStable } from '../utils/discovery';
import type { useTrending } from './useTrending';

const FAVORITES_SHELF_LIMIT = 8;

interface HomeShelvesOptions {
  trimmedQuery: string;
  activeType: ContentType | 'all';
  displayedItems: (MediaSummary | ContentItem)[];
  savedMedia: MediaSummary[];
  trending: ReturnType<typeof useTrending>;
}

/** What the home screen shows around the results: the spotlight, the shelves and whether each is shown. */
export function useHomeShelves({ trimmedQuery, activeType, displayedItems, savedMedia, trending }: HomeShelvesOptions) {
  // One seed per visit: favorites look shuffled but don't jump around as they change.
  const [favoritesSeed] = useState(() => Math.random().toString(36));

  const browsing = USE_MOCK && !trimmedQuery;
  const spotlight = useMemo(() => (browsing ? pickSpotlight(displayedItems) : null), [browsing, displayedItems]);
  const shelfItems = useMemo(
    () => displayedItems.filter((item) => item.id !== spotlight?.id),
    [displayedItems, spotlight],
  );
  const mixedShelf = useMemo(() => mixAcrossTypes(shelfItems, 12), [shelfItems]);
  const typeShelves = useMemo(() => groupByType(shelfItems), [shelfItems]);
  const favoritesShelf = useMemo(
    () => (trimmedQuery ? [] : sampleStable(savedMedia, FAVORITES_SHELF_LIMIT, favoritesSeed)),
    [trimmedQuery, savedMedia, favoritesSeed],
  );
  const trendingItems = useMemo(
    // The spotlight already features its title right above the shelf.
    () => (USE_MOCK ? mockTrending : trending.items).filter((item) => item.id !== spotlight?.id),
    [trending.items, spotlight],
  );

  return {
    spotlight,
    shelfItems,
    mixedShelf,
    typeShelves,
    showShelves: browsing && activeType === 'all' && shelfItems.length > 0,
    favoritesShelf,
    trendingItems,
    // Shown before a search while it loads, has items, or has a problem worth explaining;
    // a feed that answered with nothing is simply left out.
    showTrending: !trimmedQuery && (trendingItems.length > 0 || trending.loading || Boolean(trending.problem)),
    // Like search, only a feed with nothing to show is an error; missing types are a warning.
    trendingFailed: Boolean(trending.problem) && trendingItems.length === 0,
  };
}

export type HomeShelves = ReturnType<typeof useHomeShelves>;
