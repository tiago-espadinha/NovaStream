import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StarIcon from '../../src/components/StarIcon/StarIcon';

describe('StarIcon', () => {
  it('draws at the size it is given, in the secondary color', () => {
    const html = renderToStaticMarkup(<StarIcon size="14px" />);
    expect(html).toContain('style="height:14px;width:14px"');
    expect(html).toContain('fill="var(--color-secondary)"');
  });
});
