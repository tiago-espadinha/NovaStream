export type FieldErrors = { email?: string; password?: string };

/** Client-side checks run before submitting; the server still validates. */
export function validateCredentials(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Enter a valid email address, like you@example.com.';
  }
  if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
  return errors;
}

export type PasswordChangeErrors = { currentPassword?: string; newPassword?: string };

// The server counts bytes, because bcrypt ignores everything past 72 of them.
const MAX_PASSWORD_BYTES = 72;
const MIN_PASSWORD = 8;

export function validatePasswordChange(currentPassword: string, newPassword: string): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};
  if (!currentPassword) errors.currentPassword = 'Enter your current password.';
  if (newPassword.length < MIN_PASSWORD) errors.newPassword = `Password must be at least ${MIN_PASSWORD} characters.`;
  else if (new TextEncoder().encode(newPassword).length > MAX_PASSWORD_BYTES) {
    errors.newPassword = 'Password must be at most 72 characters.';
  } else if (newPassword === currentPassword) {
    errors.newPassword = 'Choose a password different from your current one.';
  }
  return errors;
}
