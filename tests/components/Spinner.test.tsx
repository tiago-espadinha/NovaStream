import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Spinner from '../../src/components/Spinner/Spinner';

describe('Spinner', () => {
  const html = renderToStaticMarkup(<Spinner label="Loading albums…" />);

  it('announces its label as a status', () => {
    expect(html).toMatch(/^<div class="spinner" role="status">/);
    expect(html).toContain('<span>Loading albums…</span>');
  });

  it('hides the animation from screen readers', () => {
    expect(html).toContain('<span class="loader" aria-hidden="true">');
  });
});
