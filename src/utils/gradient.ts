// Live API results don't come with a poster gradient — when there's also no posterUrl,
// derive a stable pair of colors from the id so the same item always looks the same.
const PALETTE: Array<[string, string]> = [
  ['var(--media-plum)', 'var(--media-plum-coral)'],
  ['var(--media-navy)', 'var(--media-cobalt)'],
  ['var(--media-teal)', 'var(--media-mint)'],
  ['var(--media-umber)', 'var(--media-gold)'],
  ['var(--media-rose)', 'var(--media-amber)'],
  ['var(--media-olive)', 'var(--media-lime)'],
  ['var(--media-berry)', 'var(--media-pink)'],
  ['var(--media-ink)', 'var(--media-cyan)'],
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function gradientForId(id: string): { from: string; to: string } {
  const [from, to] = PALETTE[hashString(id) % PALETTE.length];
  return { from, to };
}

/** Inline style for a title with no artwork: the item's own colors, else a stable fallback pair. */
export function fallbackArtwork(item: { id: string; gradientFrom?: string; gradientTo?: string }) {
  const fallback = gradientForId(item.id);
  return {
    background: `linear-gradient(155deg, ${item.gradientFrom ?? fallback.from}, ${item.gradientTo ?? fallback.to})`,
  };
}
