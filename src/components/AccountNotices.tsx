import { useEffect, useRef } from 'react';
import { StatusIcon } from './StatusIcon';

export interface AccountNotice {
  id: string;
  message: string;
  tone: 'error' | 'warning' | 'success';
  action?: { label: string; onClick: () => void };
  onDismiss: () => void;
}

/**
 * Account messages that aren't tied to one card: an ended session, a save that failed, or
 * guest favorites moved to the account. A polite live region that stays mounted, so screen
 * readers announce messages as they appear.
 */
export function AccountNotices({ notices }: { notices: AccountNotice[] }) {
  const regionRef = useRef<HTMLDivElement>(null);

  // The notices float over the page; publish their height so the page can keep focused
  // controls and the footer clear of them (see --notice-space in index.css).
  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      const height = region.getBoundingClientRect().height;
      root.style.setProperty('--notice-space', height > 0 ? `calc(${height}px + var(--space-8))` : '0px');
    });
    observer.observe(region);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--notice-space');
    };
  }, []);

  return (
    <div ref={regionRef} className="account-notices" role="status" aria-live="polite">
      {notices.map((notice) => (
        <div key={notice.id} className={`notice notice-${notice.tone}`}>
          <p>
            <StatusIcon tone={notice.tone} />
            {notice.message}
          </p>
          <div className="notice-actions">
            {notice.action && (
              <button type="button" className="btn btn-primary" onClick={notice.action.onClick}>
                {notice.action.label}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              aria-label={`Dismiss: ${notice.message}`}
              onClick={notice.onDismiss}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
