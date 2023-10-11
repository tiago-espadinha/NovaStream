import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../hooks/useDialog';
import { validateCredentials, type FieldErrors } from '../utils/authValidation';

interface LoginModalProps {
  onClose: () => void;
}

export function LoginModal({ onClose }: LoginModalProps) {
  const { login, register, loading, error } = useAuth();
  const panelRef = useDialog<HTMLDivElement>(onClose);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errors = validateCredentials(email, password);
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      document.getElementById(errors.email ? 'auth-email' : 'auth-password')?.focus();
      return;
    }
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
      onClose();
    } catch {
      // error is already surfaced via useAuth().error
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="dialog-panel auth-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        aria-describedby="auth-subtitle"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="icon-button auth-close" aria-label="Close" onClick={onClose}>
          <span aria-hidden="true">✕</span>
        </button>
        <p className="eyebrow">Your account</p>
        <h2 id="auth-title" className="auth-title">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h2>
        <p id="auth-subtitle" className="auth-subtitle">
          Save favorites and preferences across devices — or keep browsing without an account.
        </p>

        <form onSubmit={handleSubmit} className="auth-form" aria-busy={loading} noValidate>
          {mode === 'register' && (
            <label>
              Name <span className="optional">(optional)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          )}
          <label>
            Email
            <input
              id="auth-email"
              type="email"
              required
              data-autofocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
            />
            {fieldErrors.email && (
              <span id="auth-email-error" className="field-error">
                {fieldErrors.email}
              </span>
            )}
          </label>
          <label>
            Password
            <input
              id="auth-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((current) => ({ ...current, password: undefined }));
              }}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'auth-password-error' : 'password-hint'}
            />
            {fieldErrors.password ? (
              <span id="auth-password-error" className="field-error">
                {fieldErrors.password}
              </span>
            ) : (
              <span id="password-hint" className="field-hint">At least 8 characters</span>
            )}
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          className="auth-switch"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
