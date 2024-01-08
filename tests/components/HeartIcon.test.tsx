import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import HeartIcon from '../../src/components/HeartIcon/HeartIcon';

const heart = (favorite: boolean) =>
  renderToStaticMarkup(<HeartIcon favorite={favorite} size="18px" primaryColor="red" secondaryColor="white" />);

describe('HeartIcon', () => {
  it('is filled in the primary color when a favorite', () => {
    expect(heart(true)).toContain('stroke="red" fill="red"');
  });

  it('is an outline in the secondary color otherwise', () => {
    expect(heart(false)).toContain('stroke="white" fill="none"');
  });

  it('takes the size it is given', () => {
    expect(heart(true)).toContain('style="height:18px;width:18px"');
  });
});
