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
