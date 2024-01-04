import { useTranslation } from 'react-i18next';
import { useDialog } from '../hooks/useDialog';
import Spinner from './Spinner';
import type { LiveProblem } from '../utils/liveErrors';

interface DetailStatusProps {
  title?: string;
  error: LiveProblem | null;
  onRetry: () => void;
  /** Title of the detail this one was opened from, for the Back button. */
  backTo?: string;
  onBack: () => void;
  onClose: () => void;
}

/** Stands in for the detail overlay while a live title loads or after it fails. */
export function DetailStatus({ title, error, onRetry, backTo, onBack, onClose }: DetailStatusProps) {
  const { t } = useTranslation();
  const panelRef = useDialog<HTMLDivElement>(onClose);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="dialog-panel detail-status"
        role="dialog"
        aria-modal="true"
        aria-label={error ? t('detailStatus.errorLabel') : t('detailStatus.loadingLabel')}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {error ? (
          <div role="alert">
            <h2>{title ? t('detailStatus.errorTitle', { title }) : t('detailStatus.errorLabel')}</h2>
            <p>{error.message}</p>
          </div>
        ) : (
          <Spinner label={t('detailStatus.loading')} />
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
              {t('common.tryAgain')}
            </button>
          )}
          {backTo && (
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              {t('detailStatus.backTo', { title: backTo })}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
