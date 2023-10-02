import { useEffect, useRef } from 'react';

// Open dialog panels, innermost last; only the top one responds to Escape and Tab.
const openPanels: HTMLElement[] = [];

export const isDialogOpen = () => openPanels.length > 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Modal behavior for a dialog panel: moves focus inside on open, keeps Tab within it,
 * closes on Escape, locks page scroll, and returns focus to the opener on close.
 * Put `data-autofocus` on the element that should receive initial focus, and
 * `data-focus-fallback` (with tabIndex -1) on where focus should go if the opener is gone.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const panelRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    (panel.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? panel).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (openPanels[openPanels.length - 1] !== panel) return;
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      // The focused control can unmount (e.g. a retry button); pull focus back inside.
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        items[0].focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    openPanels.push(panel);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      openPanels.splice(openPanels.indexOf(panel), 1);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // The opener may have unmounted (e.g. a genre search re-rendered the results).
      const returnTarget = opener?.isConnected
        ? opener
        : document.querySelector<HTMLElement>('[data-focus-fallback]');
      returnTarget?.focus();
    };
  }, []);

  return panelRef;
}
