// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../src/context/useAuth';
import { LoginModal } from '../../src/screens/account/LoginModal';
import { ApiError } from '../../src/services/apiService';

const auth = {
  login: vi.fn(),
  register: vi.fn(),
  clearError: vi.fn(),
  loading: false,
  error: null as string | null,
};

function modal() {
  const onClose = vi.fn();
  const view = render(
    <AuthContext.Provider value={auth as unknown as AuthContextValue}>
      <LoginModal onClose={onClose} />
    </AuthContext.Provider>,
  );
  return { onClose, ...view };
}

const email = () => screen.getByLabelText(/^Email/);
const password = () => screen.getByLabelText(/^Password/);
const signIn = () => screen.getByRole('button', { name: 'Sign in' });

function fill(address = 'ana@example.com', secret = 'password1') {
  fireEvent.change(email(), { target: { value: address } });
  fireEvent.change(password(), { target: { value: secret } });
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.loading = false;
  auth.error = null;
});

describe('LoginModal', () => {
  it('opens on sign-in with focus on the email', () => {
    modal();
    expect(screen.getByRole('dialog', { name: 'Welcome back' })).toBeTruthy();
    expect(document.activeElement).toBe(email());
    expect(password().getAttribute('autocomplete')).toBe('current-password');
  });

  it('closes from the button, the backdrop and Escape', () => {
    const { onClose } = modal();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('stops at the first invalid field and sends nothing', () => {
    modal();
    fill('not-an-email', 'short');
    fireEvent.click(signIn());

    expect(auth.login).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(email());
    expect(email().getAttribute('aria-describedby')).toBe('auth-email-error');
    expect(screen.getByText('Enter a valid email address, like you@example.com.')).toBeTruthy();

    fireEvent.change(email(), { target: { value: 'ana@example.com' } });
    expect(email().getAttribute('aria-invalid')).toBe('false');
    fireEvent.click(signIn());
    expect(document.activeElement).toBe(password());
    expect(password().getAttribute('aria-describedby')).toBe('auth-password-error');
  });

  it('signs in and closes', async () => {
    auth.login.mockResolvedValue(undefined);
    const { onClose } = modal();
    fill();
    fireEvent.click(signIn());
    expect(auth.login).toHaveBeenCalledWith('ana@example.com', 'password1');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open when sign-in fails, showing the message as an alert', async () => {
    auth.login.mockRejectedValue(new ApiError(400, 'Wrong'));
    auth.error = 'Wrong email or password.';
    const { onClose } = modal();
    fill();
    fireEvent.click(signIn());
    await waitFor(() => expect(auth.login).toHaveBeenCalled());
    expect(screen.getByRole('alert').textContent).toBe('Wrong email or password.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Sign in instead' })).toBeNull();
  });

  it('disables the submit button while waiting', () => {
    auth.loading = true;
    modal();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Please wait…' }).disabled).toBe(true);
    expect(screen.getByRole('dialog').querySelector('form')?.getAttribute('aria-busy')).toBe('true');
  });

  it('switching to sign-up keeps what was typed, adds a name and drops the old error', () => {
    modal();
    fill();
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }));

    expect(screen.getByRole('dialog', { name: 'Create your account' })).toBeTruthy();
    expect(email()).toHaveProperty('value', 'ana@example.com');
    expect(screen.getByLabelText(/^Name/)).toBeTruthy();
    expect(password().getAttribute('autocomplete')).toBe('new-password');
    expect(auth.clearError).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Already have an account? Sign in' }));
    expect(screen.queryByLabelText(/^Name/)).toBeNull();
  });

  it('registers with the name and closes', async () => {
    auth.register.mockResolvedValue(undefined);
    const { onClose } = modal();
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }));
    fill();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(auth.register).toHaveBeenCalledWith('ana@example.com', 'password1', 'Ana');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('offers sign-in for a taken email, clearing the made-up password', async () => {
    auth.register.mockRejectedValue(new ApiError(409, 'Taken', 'email_taken'));
    auth.error = 'An account with that email already exists.';
    modal();
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }));
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in instead' }));
    expect(screen.getByRole('dialog', { name: 'Welcome back' })).toBeTruthy();
    expect(email()).toHaveProperty('value', 'ana@example.com');
    expect(password()).toHaveProperty('value', '');
    expect(document.activeElement).toBe(password());
    expect(auth.clearError).toHaveBeenCalled();
  });
});
