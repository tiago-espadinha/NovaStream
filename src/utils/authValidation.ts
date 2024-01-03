import i18n from '../i18n';

export type FieldErrors = { email?: string; password?: string };

/** Client-side checks run before submitting; the server still validates. */
export function validateCredentials(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = i18n.t('validation.email');
  }
  if (password.length < 8) errors.password = i18n.t('validation.passwordMin', { min: MIN_PASSWORD });
  return errors;
}

export type PasswordChangeErrors = { currentPassword?: string; newPassword?: string };

// The server counts bytes, because bcrypt ignores everything past 72 of them.
const MAX_PASSWORD_BYTES = 72;
const MIN_PASSWORD = 8;

export function validatePasswordChange(currentPassword: string, newPassword: string): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};
  if (!currentPassword) errors.currentPassword = i18n.t('validation.currentPasswordRequired');
  if (newPassword.length < MIN_PASSWORD) errors.newPassword = i18n.t('validation.passwordMin', { min: MIN_PASSWORD });
  else if (new TextEncoder().encode(newPassword).length > MAX_PASSWORD_BYTES) {
    errors.newPassword = i18n.t('validation.passwordMax', { max: MAX_PASSWORD_BYTES });
  } else if (newPassword === currentPassword) {
    errors.newPassword = i18n.t('validation.passwordUnchanged');
  }
  return errors;
}
