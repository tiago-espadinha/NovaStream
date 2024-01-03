import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDialog } from '../hooks/useDialog';

interface ArtworkViewerProps {
  src: string;
  title: string;
  onClose: () => void;
}

/** Full-size artwork over the detail dialog; any click or Escape closes it. */
export function ArtworkViewer({ src, title, onClose }: ArtworkViewerProps) {
  const { t } = useTranslation();
  const panelRef = useDialog<HTMLDivElement>(onClose);

  return createPortal(
    <div
      ref={panelRef}
      className="artwork-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={t('artwork.label', { title })}
      tabIndex={-1}
      onClick={onClose}
    >
      <img src={src} alt={t('artwork.label', { title })} />
      <button type="button" className="icon-button artwork-viewer-close" aria-label={t('artwork.close')} data-autofocus>
        <span aria-hidden="true">✕</span>
      </button>
    </div>,
    document.body,
  );
}
