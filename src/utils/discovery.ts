import type { ContentType, MediaSummary } from '../types';
import { CONTENT_TYPE_LABELS, MUSIC_KIND_LABELS } from '../types';

const TYPE_ORDER = Object.keys(CONTENT_TYPE_LABELS) as ContentType[];

const SINGULAR_TYPE_LABELS: Record<ContentType, string> = {
  movie: 'Movie',
  tv: 'Series',
  music: 'Music',
  book: 'Book',
  game: 'Game',
};

export function mediaTypeLabel(item: Pick<MediaSummary, 'type' | 'musicKind'>): string {
  if (item.musicKind) return `Music · ${MUSIC_KIND_LABELS[item.musicKind]}`;
  return SINGULAR_TYPE_LABELS[item.type];
}

function outranks(candidate: MediaSummary, best: MediaSummary): boolean {
  if (Boolean(candidate.posterUrl) !== Boolean(best.posterUrl)) return Boolean(candidate.posterUrl);
  return (candidate.rating ?? 0) > (best.rating ?? 0);
}

/** The featured title: real artwork first, then the best-rated non-music title. */
export function pickSpotlight<T extends MediaSummary>(items: T[]): T | null {
  // Music ratings are play counts, so they only compete with other music.
  const rated = items.filter((item) => item.type !== 'music');
  const pool = rated.length > 0 ? rated : items;
  if (pool.length === 0) return null;
  return pool.reduce((best, item) => (outranks(item, best) ? item : best));
}

/** Interleaves formats round-robin so a single shelf spans all media types. */
export function mixAcrossTypes<T extends MediaSummary>(items: T[], limit: number): T[] {
  const queues = groupByType(items).map((group) => [...group.items]);
  const mixed: T[] = [];
  while (mixed.length < limit && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && mixed.length < limit) mixed.push(next);
    }
  }
  return mixed;
}

export function groupByType<T extends MediaSummary>(items: T[]): Array<{ type: ContentType; items: T[] }> {
  return TYPE_ORDER.map((type) => ({ type, items: items.filter((item) => item.type === type) })).filter(
    (group) => group.items.length > 0,
  );
}

// FNV-1a plus a final avalanche, so ids that differ by one character land far apart.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * A random-looking sample that stays put for a given seed, so removing one favorite
 * doesn't reshuffle the rest of the carousel.
 */
export function sampleStable<T extends MediaSummary>(items: T[], limit: number, seed: string): T[] {
  return [...items].sort((a, b) => hash(seed + a.id) - hash(seed + b.id)).slice(0, limit);
}
