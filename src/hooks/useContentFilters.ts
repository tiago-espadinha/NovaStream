import { useMemo, useState } from 'react';
import { USE_MOCK } from '../config';
import { CONTENT_TYPES, type ContentType, type MediaSummary, type MusicKind } from '../types';
import {
  applyContentFilters,
  COMMON_GENRES_BY_TYPE,
  playsSliderRange,
  type GenreSelection,
  type SortOption,
} from '../utils/contentFilters';

interface ContentFilterOptions<T extends MediaSummary> {
  items: T[];
  query: string;
  activeType: ContentType | 'all';
  musicKind: MusicKind | 'all';
  onMusicKindChange: (kind: MusicKind | 'all') => void;
}

export function useContentFilters<T extends MediaSummary>({
  items,
  query,
  activeType,
  musicKind,
  onMusicKindChange,
}: ContentFilterOptions<T>) {
  const [selectedCategories, setSelectedCategories] = useState<ContentType[]>(CONTENT_TYPES);
  const [selectedGenres, setSelectedGenres] = useState<GenreSelection[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [minPlays, setMinPlays] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>('featured');

  const activeCategories = useMemo(
    () => (activeType === 'all' ? selectedCategories : [activeType]),
    [activeType, selectedCategories],
  );

  // From the unfiltered results, so raising the minimum never shrinks the slider under it.
  const playsRange = useMemo(() => playsSliderRange(items), [items]);

  // Kept on the slider's steps and within its range, so the thumb shows the value that filters.
  const [snappedTo, setSnappedTo] = useState(playsRange);
  if (playsRange !== snappedTo) {
    const { max, step } = playsRange;
    setSnappedTo(playsRange);
    setMinPlays((current) => Math.min(Math.round(current / step) * step, max));
  }

  const genreGroups = useMemo(() => {
    const types = activeType === 'all' ? selectedCategories : [activeType];
    return types.map((type) => ({ type, genres: COMMON_GENRES_BY_TYPE[type] }));
  }, [activeType, selectedCategories]);

  const displayedItems = useMemo(() => {
    return applyContentFilters(items, {
      activeType,
      selectedCategories: activeCategories,
      selectedGenres,
      query,
      minRating,
      minPlays,
      sortBy,
      providerMatched: !USE_MOCK,
    });
  }, [items, activeType, activeCategories, selectedGenres, query, minRating, minPlays, sortBy]);

  const [genresFor, setGenresFor] = useState(activeType);
  if (activeType !== genresFor) {
    setGenresFor(activeType);
    if (activeType !== 'all') {
      setSelectedGenres((current) => current.filter(({ type }) => type === activeType));
    }
  }

  const toggleCategory = (type: ContentType) => {
    const isSelected = selectedCategories.includes(type);
    setSelectedCategories((current) => (isSelected ? current.filter((item) => item !== type) : [...current, type]));
    if (isSelected) {
      setSelectedGenres((current) => current.filter((genre) => genre.type !== type));
    }
  };

  const toggleGenre = (type: ContentType, genre: string) => {
    setSelectedGenres((current) => {
      const exists = current.some((item) => item.type === type && item.genre === genre);
      return exists
        ? current.filter((item) => item.type !== type || item.genre !== genre)
        : [...current, { type, genre }];
    });
  };

  const reset = () => {
    setSelectedCategories(CONTENT_TYPES);
    setSelectedGenres([]);
    setMinRating(0);
    setMinPlays(0);
    onMusicKindChange('all');
  };

  const activeCount =
    selectedGenres.length +
    (activeType === 'all' && selectedCategories.length < CONTENT_TYPES.length ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (minPlays > 0 ? 1 : 0) +
    (activeCategories.includes('music') && musicKind !== 'all' ? 1 : 0);

  return {
    selectedCategories,
    selectedGenres,
    activeCategories,
    genreGroups,
    musicKind,
    minRating,
    minPlays,
    playsRange,
    sortBy,
    displayedItems,
    activeCount,
    toggleCategory,
    toggleGenre,
    setMusicKind: onMusicKindChange,
    setMinRating,
    setMinPlays,
    setSortBy,
    reset,
  };
}

export type ContentFilters<T extends MediaSummary = MediaSummary> = ReturnType<typeof useContentFilters<T>>;
