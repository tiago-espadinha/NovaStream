import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import FooterIcon from '../../src/components/FooterIcon/FooterIcon';

const icon = (kind: 'github' | 'linkedin') => renderToStaticMarkup(<FooterIcon kind={kind} />);

describe('FooterIcon', () => {
  it('is decorative: the link around it carries the name', () => {
    expect(icon('github')).toContain('aria-hidden="true"');
    expect(icon('github')).toContain('focusable="false"');
  });

  it('draws one mark per kind', () => {
    expect(icon('github')).not.toBe(icon('linkedin'));
    expect(icon('github').match(/<path/g)).toHaveLength(1);
    expect(icon('linkedin').match(/<path/g)).toHaveLength(1);
  });
});
