import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScoreBadge } from '../../src/components/ScoreBadge/ScoreBadge';
import type { MediaSummary } from '../../src/types';
import { media } from '../helpers/fixtures';

const badge = (item: MediaSummary, fallback?: string) =>
  renderToStaticMarkup(<ScoreBadge item={item} fallback={fallback} />);
const text = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '');

describe('ScoreBadge', () => {
  it('labels a rating for screen readers, always with one decimal', () => {
    const html = badge(media('movie-1', { rating: 8 }));
    expect(html).toContain('<span class="visually-hidden">Rating: </span>');
    expect(text(html)).toBe('Rating: 8.0');
  });

  it('shows a dash when unrated, or the fallback it is given', () => {
    const unrated = media('movie-1', { rating: null });
    expect(text(badge(unrated))).toBe('—');
    expect(text(badge(unrated, 'Not yet rated'))).toBe('Not yet rated');
    expect(badge(unrated)).not.toContain('Rating: ');
  });

  it('counts plays for music, abbreviated, in place of a star rating', () => {
    const html = badge(media('music-1', { type: 'music', rating: 1_200_000 }));
    expect(html).toContain('class="score music"');
    expect(text(html)).toBe('Plays: 1.2M');
  });

  it('falls back to the play stats a music title carries', () => {
    const item = media('music-1', { type: 'music', rating: null, playStats: { listeners: '1', playcount: '3,400' } });
    expect(text(badge(item))).toBe('Plays: 3.4K');
  });

  it('shows the fallback for music with no plays known', () => {
    expect(text(badge(media('music-1', { type: 'music', rating: null })))).toBe('—');
  });

  it('hides its icon from screen readers', () => {
    expect(badge(media('movie-1'))).toMatch(/<span aria-hidden="true"><div[^>]*><svg/);
  });
});
