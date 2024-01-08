import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KeywordChip } from '../../src/components/KeywordChip/KeywordChip';

describe('KeywordChip', () => {
  const html = renderToStaticMarkup(<KeywordChip kind="genre" value="Drama" />);

  it('shows the styled kind to sight only, and plain text to screen readers', () => {
    expect(html).toContain('<span class="keyword-kind" aria-hidden="true">genre</span>');
    expect(html).toContain('<span class="visually-hidden">genre:</span>');
  });

  it('reads as "genre: Drama" once the hidden copy is set aside', () => {
    const readable = html.replace(/<span class="keyword-kind"[^>]*>.*?<\/span>/, '').replace(/<[^>]+>/g, '');
    expect(readable).toBe('genre: Drama');
  });
});
