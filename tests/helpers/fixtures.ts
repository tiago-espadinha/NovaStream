import type { AuthUser, ContentItem, MediaSummary } from '../../src/types';

export const user: AuthUser = {
  id: 'u1',
  email: 'ana@example.com',
  name: 'Ana',
  preferences: { favoriteGenres: [] },
  savedMedia: [],
  createdAt: '2026-01-01',
};

export function media(id: string, overrides: Partial<MediaSummary> = {}): MediaSummary {
  return { id, title: `Title ${id}`, type: 'movie', rating: 7, genres: [], ...overrides };
}

export function contentItem(id: string, overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    ...media(id),
    overview: `Overview of ${id}`,
    releaseYear: 2020,
    length: null,
    creatorRole: 'director',
    creator: 'A. Director',
    platforms: [],
    ...overrides,
  };
}

/** A promise the test settles by hand, to hold a request open while something else happens. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
