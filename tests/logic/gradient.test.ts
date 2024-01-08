import { describe, expect, it } from 'vitest';
import { fallbackArtwork, gradientForId } from '../../src/utils/gradient';

describe('gradientForId', () => {
  it('gives the same id the same colors every time', () => {
    expect(gradientForId('movie-603')).toEqual(gradientForId('movie-603'));
  });

  it('spreads ids across several color pairs', () => {
    const pairs = new Set(Array.from({ length: 50 }, (_, index) => gradientForId(`movie-${index}`).from));
    expect(pairs.size).toBeGreaterThan(1);
  });

  it('always answers with design tokens, including for odd ids', () => {
    for (const id of ['', 'x', '🎬', 'a'.repeat(5000)]) {
      const { from, to } = gradientForId(id);
      expect(from).toMatch(/^var\(--media-[a-z-]+\)$/);
      expect(to).toMatch(/^var\(--media-[a-z-]+\)$/);
    }
  });
});

describe('fallbackArtwork', () => {
  it('uses the item’s own colors when it has them', () => {
    expect(fallbackArtwork({ id: 'a', gradientFrom: 'red', gradientTo: 'blue' }).background).toBe(
      'linear-gradient(155deg, red, blue)',
    );
  });

  it('derives both colors from the id when it has none', () => {
    const { from, to } = gradientForId('movie-603');
    expect(fallbackArtwork({ id: 'movie-603' }).background).toBe(`linear-gradient(155deg, ${from}, ${to})`);
  });

  it('fills in only the side that is missing', () => {
    const { to } = gradientForId('movie-603');
    expect(fallbackArtwork({ id: 'movie-603', gradientFrom: 'red' }).background).toBe(
      `linear-gradient(155deg, red, ${to})`,
    );
  });
});
