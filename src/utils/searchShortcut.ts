// Cmd+K on macOS, Ctrl+K elsewhere. On macOS Ctrl+K stays the text-field
// "delete to end of line", so only the platform's own modifier counts.
export type ShortcutKey = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing'>;

export function isSearchShortcut(event: ShortcutKey, isMac: boolean): boolean {
  if (event.isComposing || event.altKey || event.shiftKey) return false;
  if (event.key.toLowerCase() !== 'k') return false;
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

export function isMacPlatform(nav: Pick<Navigator, 'platform' | 'userAgent'> = navigator): boolean {
  const platform =
    (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || nav.platform || nav.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function searchShortcutLabels(isMac: boolean) {
  return isMac
    ? { hint: '⌘K', aria: 'Meta+K' }
    : { hint: 'Ctrl K', aria: 'Control+K' };
}
