import { describe, expect, it } from 'vitest';
import { isMacPlatform, isSearchShortcut, searchShortcutLabels, type ShortcutKey } from './searchShortcut';

const key = (overrides: Partial<ShortcutKey>): ShortcutKey => ({
  key: 'k',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  ...overrides,
});

describe('isSearchShortcut', () => {
  it('accepts Ctrl+K off macOS and Cmd+K on macOS', () => {
    expect(isSearchShortcut(key({ ctrlKey: true }), false)).toBe(true);
    expect(isSearchShortcut(key({ metaKey: true }), true)).toBe(true);
  });

  it("ignores the other platform's modifier", () => {
    expect(isSearchShortcut(key({ metaKey: true }), false)).toBe(false);
    expect(isSearchShortcut(key({ ctrlKey: true }), true)).toBe(false);
  });

  it('matches K regardless of case (Caps Lock)', () => {
    expect(isSearchShortcut(key({ key: 'K', ctrlKey: true }), false)).toBe(true);
  });

  it('rejects extra modifiers, other keys, a bare K and IME composition', () => {
    expect(isSearchShortcut(key({ ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(isSearchShortcut(key({ ctrlKey: true, altKey: true }), false)).toBe(false);
    expect(isSearchShortcut(key({ ctrlKey: true, metaKey: true }), false)).toBe(false);
    expect(isSearchShortcut(key({ key: 'j', ctrlKey: true }), false)).toBe(false);
    expect(isSearchShortcut(key({}), false)).toBe(false);
    expect(isSearchShortcut(key({ ctrlKey: true, isComposing: true }), false)).toBe(false);
  });
});

describe('isMacPlatform', () => {
  it('detects Apple platforms from navigator.platform', () => {
    expect(isMacPlatform({ platform: 'MacIntel', userAgent: '' })).toBe(true);
    expect(isMacPlatform({ platform: 'iPad', userAgent: '' })).toBe(true);
    expect(isMacPlatform({ platform: 'Win32', userAgent: '' })).toBe(false);
    expect(isMacPlatform({ platform: 'Linux x86_64', userAgent: '' })).toBe(false);
  });

  it('falls back to the user agent when platform is empty', () => {
    expect(isMacPlatform({ platform: '', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe(true);
  });
});

describe('searchShortcutLabels', () => {
  it('names the key per platform for the hint and aria-keyshortcuts', () => {
    expect(searchShortcutLabels(true)).toEqual({ hint: '⌘K', aria: 'Meta+K' });
    expect(searchShortcutLabels(false)).toEqual({ hint: 'Ctrl K', aria: 'Control+K' });
  });
});
