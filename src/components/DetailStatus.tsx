import { useDialog } from '../hooks/useDialog';
import Spinner from './Spinner';
import type { LiveProblem } from '../utils/liveErrors';

interface DetailStatusProps {
  title?: string;
  error: LiveProblem | null;
  onRetry: () => void;
  onClose: () => void;
}

/** Stands in for the detail overlay while a live title loads or after it fails. */
export function DetailStatus({ title, error, onRetry, onClose }: DetailStatusProps) {
  const panelRef = useDialog<HTMLDivElement>(onClose);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="dialog-panel detail-status"
        role="dialog"
        aria-modal="true"
        aria-label={error ? 'Couldn’t load details' : 'Loading details'}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {error ? (
          <div role="alert">
            <h2>{title ? `Couldn’t load “${title}”` : 'Couldn’t load details'}</h2>
            <p>{error.message}</p>
          </div>
        ) : (
          <Spinner label="Loading details…" />
        )}
        <div className="dialog-actions">
          {error?.retryable && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                // Keep focus inside the dialog while the retry button unmounts.
                panelRef.current?.focus();
                onRetry();
              }}
            >
              Try again
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
