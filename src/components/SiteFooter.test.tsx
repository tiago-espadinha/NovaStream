import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SiteFooter } from './SiteFooter';
import { DATA_SOURCES, DEVELOPER_LINKS, DEVELOPER_NAME, DEVELOPER_PORTFOLIO } from '../data/credits';

const html = renderToStaticMarkup(<SiteFooter />);
const anchors = [...html.matchAll(/<a [^>]*>/g)].map((match) => match[0]);

describe('SiteFooter', () => {
  it('links the developer name to the portfolio, naming where it goes', () => {
    expect(DEVELOPER_PORTFOLIO).toMatch(/^https:\/\//);
    expect(html).toContain(
      `<a class="footer-developer-name" href="${DEVELOPER_PORTFOLIO}" target="_blank" rel="noopener noreferrer" aria-label="${DEVELOPER_NAME}’s portfolio (opens in a new tab)">${DEVELOPER_NAME}</a>`,
    );
  });

  it('links each profile with an accessible name', () => {
    for (const link of DEVELOPER_LINKS) {
      expect(link.href).toMatch(/^https:\/\//);
      expect(link.href).not.toContain('example.com');
      expect(html).toContain(`href="${link.href}"`);
      expect(html).toContain(`aria-label="${link.label} (opens in a new tab)"`);
    }
  });

  it('opens every link in a new tab without exposing the opener', () => {
    expect(anchors).toHaveLength(1 + DEVELOPER_LINKS.length + DATA_SOURCES.length);
    for (const anchor of anchors) {
      expect(anchor).toContain('target="_blank"');
      expect(anchor).toContain('rel="noopener noreferrer"');
    }
  });

  it('credits every data source over https without the TMDB notice', () => {
    for (const source of DATA_SOURCES) {
      expect(source.href).toMatch(/^https:\/\//);
      expect(html).toContain(`href="${source.href}"`);
    }
    expect(html).toContain('Deezer<span class="visually-hidden"> (opens in a new tab)</span></a>');
    expect(html).not.toContain('not endorsed or certified by TMDB');
  });

  it('hides the icons from assistive technology', () => {
    const icons = html.match(/<svg [^>]*>/g) ?? [];
    expect(icons).toHaveLength(DEVELOPER_LINKS.length);
    for (const icon of icons) expect(icon).toContain('aria-hidden="true"');
  });
});
