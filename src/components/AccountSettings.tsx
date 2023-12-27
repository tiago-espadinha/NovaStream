import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../hooks/useDialog';
import { ApiError } from '../services/apiService';
import { describeAccountError, isSessionEnded } from '../utils/accountErrors';
import { validatePasswordChange, type PasswordChangeErrors } from '../utils/authValidation';
import { StatusIcon } from './StatusIcon';

const isWrongPassword = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.code === 'wrong_password';

interface AccountSettingsProps {
  onClose: () => void;
  onDeleted: () => void;
}

/** Account settings for the signed-in user: change password, sign out, or delete the account. */
export function AccountSettings({ onClose, onDeleted }: AccountSettingsProps) {
  const { user, logout } = useAuth();
  const panelRef = useDialog<HTMLDivElement>(onClose);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="dialog-panel auth-panel account-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="icon-button auth-close" aria-label="Close" onClick={onClose}>
          <span aria-hidden="true">✕</span>
        </button>
        <p className="eyebrow">Your account</p>
        <h2 id="account-title" className="auth-title account-name-title">
          {user?.name ?? 'Account'}
        </h2>
        {user && <p className="auth-subtitle account-email">{user.email}</p>}

        <ChangePassword onSessionEnded={onClose} />

        <section className="account-section" aria-labelledby="account-signout-title">
          <h3 id="account-signout-title">Sign out</h3>
          <p>Signs you out on this device. Your saved titles stay in your account.</p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              logout();
              onClose();
            }}
          >
            Sign out
          </button>
        </section>

        <DeleteAccount onDeleted={onDeleted} onSessionEnded={onClose} />
      </div>
    </div>
  );
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  error?: string;
  hint?: string;
  /** `dialog`: the field the dialog focuses when it opens; `mount`: focused when it appears later. */
  focus?: 'dialog' | 'mount';
}

function PasswordField({ id, label, value, onChange, autoComplete, error, hint, focus }: PasswordFieldProps) {
  const messageId = `${id}-${error ? 'error' : 'hint'}`;
  return (
    <label>
      {label}
      <input
        id={id}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        data-autofocus={focus === 'dialog' || undefined}
        autoFocus={focus === 'mount'}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? messageId : undefined}
      />
      {error ? (
        <span id={messageId} className="field-error">
          <StatusIcon tone="warning" />
          {error}
        </span>
      ) : (
        hint && (
          <span id={messageId} className="field-hint">
            {hint}
          </span>
        )
      )}
    </label>
  );
}

function ChangePassword({ onSessionEnded }: { onSessionEnded: () => void }) {
  const { changePassword, endSession } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<PasswordChangeErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validatePasswordChange(currentPassword, newPassword);
    setErrors(found);
    setFormError(null);
    setSaved(false);
    if (found.currentPassword || found.newPassword) {
      document.getElementById(found.currentPassword ? 'account-current-password' : 'account-new-password')?.focus();
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setSaved(true);
    } catch (err) {
      if (isSessionEnded(err)) {
        endSession();
        onSessionEnded();
      } else if (isWrongPassword(err)) {
        setErrors({ currentPassword: err.message });
        document.getElementById('account-current-password')?.focus();
      } else {
        setFormError(describeAccountError(err, 'Couldn’t change your password. Try again.'));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="account-section" aria-labelledby="account-password-title">
      <h3 id="account-password-title">Change password</h3>
      <form onSubmit={handleSubmit} className="auth-form" aria-busy={saving} noValidate>
        <PasswordField
          id="account-current-password"
          label="Current password"
          value={currentPassword}
          onChange={(value) => {
            setCurrentPassword(value);
            setErrors((current) => ({ ...current, currentPassword: undefined }));
          }}
          autoComplete="current-password"
          error={errors.currentPassword}
          focus="dialog"
        />
        <PasswordField
          id="account-new-password"
          label="New password"
          value={newPassword}
          onChange={(value) => {
            setNewPassword(value);
            setErrors((current) => ({ ...current, newPassword: undefined }));
          }}
          autoComplete="new-password"
          error={errors.newPassword}
          hint="At least 8 characters. Your other devices will be signed out."
        />
        {formError && (
          <p className="auth-error" role="alert">
            <StatusIcon tone="error" />
            {formError}
          </p>
        )}
        <p className="field-success account-status" role="status">
          {saved && (
            <>
              <StatusIcon tone="success" />
              Password changed. Your other devices are signed out.
            </>
          )}
        </p>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </section>
  );
}

function DeleteAccount({ onDeleted, onSessionEnded }: { onDeleted: () => void; onSessionEnded: () => void }) {
  const { deleteAccount, endSession } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const startRef = useRef<HTMLButtonElement>(null);
  // Set by Cancel so focus goes back to the button that opened the confirm step.
  const refocusStart = useRef(false);

  useEffect(() => {
    if (confirming || !refocusStart.current) return;
    refocusStart.current = false;
    startRef.current?.focus();
  }, [confirming]);

  function cancel() {
    refocusStart.current = true;
    setConfirming(false);
    setPassword('');
    setError(undefined);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!password) {
      setError('Enter your password to delete your account.');
      return;
    }
    setDeleting(true);
    try {
      await deleteAccount(password);
      onDeleted();
    } catch (err) {
      setDeleting(false);
      if (isSessionEnded(err)) {
        endSession();
        onSessionEnded();
      } else if (isWrongPassword(err)) {
        setError(err.message);
        document.getElementById('account-delete-password')?.focus();
      } else {
        setFormError(describeAccountError(err, 'Couldn’t delete your account. Try again.'));
      }
    }
  }

  return (
    <section className="account-section account-danger" aria-labelledby="account-delete-title">
      <h3 id="account-delete-title">Delete account</h3>
      <p>Removes your account with its saved titles and collections. This can’t be undone.</p>
      {confirming ? (
        <form onSubmit={handleSubmit} className="auth-form" aria-busy={deleting} noValidate>
          <PasswordField
            id="account-delete-password"
            label="Enter your password to confirm"
            value={password}
            onChange={(value) => {
              setPassword(value);
              setError(undefined);
            }}
            autoComplete="current-password"
            error={error}
            focus="mount"
          />
          {formError && (
            <p className="auth-error" role="alert">
              <StatusIcon tone="error" />
              {formError}
            </p>
          )}
          <div className="account-actions">
            <button type="submit" className="btn btn-danger" disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete my account'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={cancel} disabled={deleting}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button ref={startRef} type="button" className="btn btn-danger-outline" onClick={() => setConfirming(true)}>
          Delete account…
        </button>
      )}
    </section>
  );
}
