import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { defaultSeason, formatAirDate } from './episodes';

const season = (number: number) => ({ number, name: `Season ${number}`, episodeCount: 1 });

describe('defaultSeason', () => {
  it('opens the lowest regular season, never specials, whatever the order', () => {
    expect(defaultSeason([season(0), season(3), season(2)])).toBe(2);
  });

  it('opens specials when a series has nothing else, and nothing for no seasons', () => {
    expect(defaultSeason([season(0)])).toBe(0);
    expect(defaultSeason([])).toBeNull();
  });
});

describe('formatAirDate', () => {
  it('formats the calendar date as given, without shifting it by time zone', () => {
    expect(formatAirDate('2024-01-05', 'en-GB')).toBe('5 Jan 2024');
    expect(formatAirDate('2023-12-31', 'en-GB')).toBe('31 Dec 2023');
  });

  it('says TBA when the date is missing or malformed', () => {
    expect(formatAirDate(null, 'en-GB')).toBe('TBA');
    expect(formatAirDate('2024', 'en-GB')).toBe('TBA');
  });

  it.each([
    ['pt-PT', '5/01/2024', 'A anunciar'],
    ['es', '5 ene 2024', 'Por anunciar'],
    ['fr', '5 janv. 2024', 'À venir'],
  ] as const)('writes the date and TBA in the active %s locale', async (locale, date, tba) => {
    await i18n.changeLanguage(locale);
    try {
      expect(formatAirDate('2024-01-05')).toBe(date);
      expect(formatAirDate(null)).toBe(tba);
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
