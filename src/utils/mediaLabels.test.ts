import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { episodeTitle, formatLength, seasonLabel } from './mediaLabels';

const t = i18n.t;

describe('formatLength', () => {
  it('words movie runtimes with zero-padded minutes', () => {
    expect(formatLength(t, { kind: 'minutes', minutes: 125 })).toBe('2h 05m');
    expect(formatLength(t, { kind: 'minutes', minutes: 134 })).toBe('2h 14m');
    expect(formatLength(t, { kind: 'minutes', minutes: 120 })).toBe('2h 00m');
  });

  it('shows short runtimes in minutes only', () => {
    expect(formatLength(t, { kind: 'minutes', minutes: 45 })).toBe('45 min');
  });

  it('pluralizes seasons and episodes', () => {
    expect(formatLength(t, { kind: 'seasons', seasons: 3, episodes: 30 })).toBe('3 seasons · 30 episodes');
    expect(formatLength(t, { kind: 'seasons', seasons: 1, episodes: 1 })).toBe('1 season · 1 episode');
  });

  it('shows a question mark for counts TMDb does not report', () => {
    expect(formatLength(t, { kind: 'seasons', seasons: null, episodes: null })).toBe('? seasons · ? episodes');
    expect(formatLength(t, { kind: 'seasons', seasons: 2, episodes: null })).toBe('2 seasons · ? episodes');
  });

  it('words game playtime', () => {
    expect(formatLength(t, { kind: 'playtime', hours: 12 })).toBe('~12 hrs');
    expect(formatLength(t, { kind: 'playtime', hours: 1 })).toBe('~1 hr');
  });

  it('words albums with and without a total duration', () => {
    expect(formatLength(t, { kind: 'tracks', tracks: 12, minutes: 48 })).toBe('12 tracks · 48 min');
    expect(formatLength(t, { kind: 'tracks', tracks: 12, minutes: null })).toBe('12 tracks');
    expect(formatLength(t, { kind: 'tracks', tracks: 1, minutes: null })).toBe('1 track');
  });

  it('formats song durations as m:ss', () => {
    expect(formatLength(t, { kind: 'duration', seconds: 225 })).toBe('3:45');
    expect(formatLength(t, { kind: 'duration', seconds: 61 })).toBe('1:01');
  });

  it('counts book pages', () => {
    expect(formatLength(t, { kind: 'pages', pages: 412 })).toBe('412 pages');
    expect(formatLength(t, { kind: 'pages', pages: 1 })).toBe('1 page');
  });

  it('returns null when there is no length', () => {
    expect(formatLength(t, null)).toBeNull();
  });
});

describe('seasonLabel', () => {
  it('prefers the name TMDb sent', () => {
    expect(seasonLabel(t, { number: 2, name: 'The Reckoning' })).toBe('The Reckoning');
  });

  it('falls back to Specials and Season N', () => {
    expect(seasonLabel(t, { number: 0, name: null })).toBe('Specials');
    expect(seasonLabel(t, { number: 5, name: null })).toBe('Season 5');
  });
});

describe('episodeTitle', () => {
  it('uses the title, or Episode N when missing', () => {
    expect(episodeTitle(t, { number: 2, title: 'Second' })).toBe('Second');
    expect(episodeTitle(t, { number: 7, title: null })).toBe('Episode 7');
  });
});
