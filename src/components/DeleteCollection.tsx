import { useState } from 'react';
import { useDialog } from '../hooks/useDialog';

interface DeleteCollectionProps {
  name: string;
  onDelete: () => void;
}

/** Bin button for the selected collection; asks in a modal first because deletion can't be undone. */
export function DeleteCollection({ name, onDelete }: DeleteCollectionProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        type="button"
        className="icon-button collection-bin"
        aria-label={`Delete collection ${name}`}
        aria-haspopup="dialog"
        title={`Delete ${name}`}
        onClick={() => setConfirming(true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
      </button>
      {confirming && <ConfirmDelete name={name} onDelete={onDelete} onClose={() => setConfirming(false)} />}
    </>
  );
}

interface ConfirmDeleteProps {
  name: string;
  onDelete: () => void;
  onClose: () => void;
}

function ConfirmDelete({ name, onDelete, onClose }: ConfirmDeleteProps) {
  const panelRef = useDialog<HTMLDivElement>(onClose);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="dialog-panel confirm-delete"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-message"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-delete-body">
          <h2 id="confirm-delete-title">Delete “{name}”?</h2>
          <p id="confirm-delete-message">
            The collection is removed for good. The titles in it stay in your Favorites.
          </p>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-danger" onClick={onDelete}>
            Delete
          </button>
          {/* Cancel takes initial focus so Enter can't delete by accident. */}
          <button type="button" className="btn btn-ghost" data-autofocus onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
