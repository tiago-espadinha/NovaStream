import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PlayIcon from '../../src/components/PlayIcon/PlayIcon';

describe('PlayIcon', () => {
  it('draws at the size it is given, in the primary color', () => {
    const html = renderToStaticMarkup(<PlayIcon size="14px" />);
    expect(html).toContain('style="height:14px;width:14px"');
    expect(html).toContain('fill="var(--color-primary)"');
  });
});
