import { describe, expect, it } from 'vitest';
import { matchScore, normalizeText } from './fuzzyMatch';

describe('normalizeText', () => {
  it('ignores case, accents, and punctuation', () => {
    expect(normalizeText('Pokémon: Red & Blue!')).toBe('pokemon red blue');
  });
});

describe('matchScore', () => {
  it('ranks an exact phrase above looser matches', () => {
    expect(matchScore('Hades II: Echoes', 'hades ii')).toBe(0);
    expect(matchScore('Hades II: Echoes', 'echoes hades')).toBe(1);
    expect(matchScore('Hades II: Echoes', 'hadez echos')).toBe(2);
  });

  it('matches accents, partial words, and missing spaces', () => {
    expect(matchScore('Pokémon Legends', 'pokemon')).toBe(0);
    expect(matchScore('The Glass Orchard', 'glass orch')).toBe(0);
    expect(matchScore('Spider Man: Far From Home', 'spiderman')).toBe(1);
  });

  it('tolerates one typo in mid-length words and two in long ones', () => {
    expect(matchScore('Midnight Aperture', 'midnigth')).toBe(2);
    expect(matchScore('Midnight Aperture', 'apperature')).toBe(2);
    expect(matchScore('Drift Kingdoms', 'kingdm')).toBe(2);
  });

  it('does not stretch short words or unrelated titles into matches', () => {
    expect(matchScore('Paperhouse', 'cat')).toBeNull();
    expect(matchScore('Signal Lost', 'ox')).toBeNull();
    expect(matchScore('Coastal Static', 'castle music')).toBeNull();
  });
});
