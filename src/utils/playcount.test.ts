import { describe, expect, it } from 'vitest';
import playcount from './playcount';

describe('playcount', () => {
  it('leaves small counts whole', () => {
    expect(playcount(999)).toBe('999');
  });

  it('abbreviates thousands, millions and billions with a decimal under 100', () => {
    expect(playcount(1_234)).toBe('1.2K');
    expect(playcount(250_000)).toBe('250K');
    expect(playcount(3_400_000)).toBe('3.4M');
    expect(playcount(5_600_000_000)).toBe('5.6B');
  });

  it('writes the decimal mark of the given locale', () => {
    expect(playcount(1_234, 'pt-PT')).toBe('1,2K');
  });
});
