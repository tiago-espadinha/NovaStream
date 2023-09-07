import type { ContentType, MediaSummary } from '../types';
import { MUSIC_KIND_LABELS } from '../types';

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
