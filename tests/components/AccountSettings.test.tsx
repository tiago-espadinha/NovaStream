// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../src/context/useAuth';
import { AccountSettings } from '../../src/screens/account/AccountSettings';
import { ApiError } from '../../src/services/apiService';
import { deferred } from '../helpers/fixtures';

const auth = {
  user: {
    id: 'u1',
    email: 'ana@example.com',
    name: 'Ana',
    preferences: { favoriteGenres: [] },
    savedMedia: [],
    createdAt: '',
  },
  logout: vi.fn(),
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
  endSession: vi.fn(),
};
const value = auth as unknown as AuthContextValue;

function settings() {
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  render(
    <AuthContext.Provider value={value}>
      <AccountSettings onClose={onClose} onDeleted={onDeleted} />
    </AuthContext.Provider>,
  );
  return { onClose, onDeleted };
}

const type = (label: string | RegExp, text: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });
const currentField = () => screen.getByLabelText(/^Current password/);
const newField = () => screen.getByLabelText(/^New password/);

function submitPassword(current = 'old-password', next = 'new-password1') {
  type(/^Current password/, current);
  type(/^New password/, next);
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

function startDelete() {
  fireEvent.click(screen.getByRole('button', { name: 'Delete account…' }));
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('AccountSettings markup', () => {
  const html = renderToStaticMarkup(
    <AuthContext.Provider value={value}>
      <AccountSettings onClose={() => {}} onDeleted={() => {}} />
    </AuthContext.Provider>,
  );

  it('is a labelled modal dialog with change password, sign out and delete sections', () => {
    expect(html).toMatch(/role="dialog" aria-modal="true" aria-labelledby="account-title"/);
    for (const id of ['account-password-title', 'account-signout-title', 'account-delete-title']) {
      expect(html).toContain(`aria-labelledby="${id}"`);
    }
  });

  it('labels both password fields for password managers', () => {
    expect(html).toMatch(
      /<input id="account-current-password" type="password"[^>]*autoComplete="current-password"[^>]*data-autofocus="true"/,
    );
    expect(html).toMatch(/<input id="account-new-password" type="password"[^>]*autoComplete="new-password"/);
    expect(html).toMatch(/aria-describedby="account-new-password-hint"/);
  });

  it('asks for confirmation before deleting: no password field or delete action until the user starts', () => {
    expect(html).toContain('Delete account…');
    expect(html).not.toContain('account-delete-password');
    expect(html).not.toContain('Delete my account');
  });
});

describe('AccountSettings dialog', () => {
  it('names the account and focuses the current password', () => {
    settings();
    expect(screen.getByRole('dialog', { name: 'Ana' })).toBeTruthy();
    expect(screen.getByText('ana@example.com')).toBeTruthy();
    expect(document.activeElement).toBe(currentField());
  });

  it('closes from the button, the backdrop and Escape, but not from inside the panel', () => {
    const { onClose } = settings();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('signs out and closes', () => {
    const { onClose } = settings();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AccountSettings change password', () => {
  it('stops at the first invalid field, with the message tied to it', () => {
    settings();
    submitPassword('', 'new-password1');
    expect(auth.changePassword).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(currentField());
    expect(currentField().getAttribute('aria-invalid')).toBe('true');
    expect(currentField().getAttribute('aria-describedby')).toBe('account-current-password-error');
    expect(screen.getByText('Enter your current password.')).toBeTruthy();
  });

  it('clears a field’s error as soon as it is edited', () => {
    settings();
    submitPassword('', 'new-password1');
    type(/^Current password/, 'x');
    expect(currentField().getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByText('Enter your current password.')).toBeNull();
  });

  it('confirms a change and empties the fields, disabling the button meanwhile', async () => {
    const request = deferred<void>();
    auth.changePassword.mockReturnValue(request.promise);
    settings();
    submitPassword();
    expect(auth.changePassword).toHaveBeenCalledWith('old-password', 'new-password1');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Changing…' }).disabled).toBe(true);

    request.resolve();
    await screen.findByText('Password changed. Your other devices are signed out.');
    expect(currentField()).toHaveProperty('value', '');
    expect(newField()).toHaveProperty('value', '');
  });

  it('puts a wrong password on the current-password field', async () => {
    auth.changePassword.mockRejectedValue(new ApiError(400, 'Nope', 'wrong_password'));
    settings();
    submitPassword();
    await screen.findByText('That password isn’t right.');
    expect(document.activeElement).toBe(currentField());
  });

  it('shows any other failure as an alert', async () => {
    auth.changePassword.mockRejectedValue(new ApiError(500, 'boom'));
    settings();
    submitPassword();
    expect((await screen.findByRole('alert')).textContent).toBe('Couldn’t change your password. Try again.');
  });

  it('ends the session and closes on a 401', async () => {
    auth.changePassword.mockRejectedValue(new ApiError(401, 'Unauthorized'));
    const { onClose } = settings();
    submitPassword();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(auth.endSession).toHaveBeenCalled();
  });
});

describe('AccountSettings delete account', () => {
  it('asks for the password first, focused, and sends nothing without it', () => {
    settings();
    startDelete();
    expect(document.activeElement).toBe(screen.getByLabelText(/^Enter your password to confirm/));

    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(screen.getByText('Enter your password to delete your account.')).toBeTruthy();
    expect(auth.deleteAccount).not.toHaveBeenCalled();
  });

  it('cancel forgets the password and returns focus to the start button', () => {
    settings();
    startDelete();
    type(/^Enter your password to confirm/, 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete account…' }));

    startDelete();
    expect(screen.getByLabelText(/^Enter your password to confirm/)).toHaveProperty('value', '');
  });

  it('reports the deletion once the server has done it', async () => {
    const request = deferred<void>();
    auth.deleteAccount.mockReturnValue(request.promise);
    const { onDeleted } = settings();
    startDelete();
    type(/^Enter your password to confirm/, 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect(auth.deleteAccount).toHaveBeenCalledWith('secret');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Deleting…' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(true);
    expect(onDeleted).not.toHaveBeenCalled();

    request.resolve();
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it('stays open on a wrong password, focused to try again', async () => {
    auth.deleteAccount.mockRejectedValue(new ApiError(400, 'Nope', 'wrong_password'));
    const { onDeleted } = settings();
    startDelete();
    type(/^Enter your password to confirm/, 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    await screen.findByText('That password isn’t right.');
    expect(document.activeElement).toBe(screen.getByLabelText(/^Enter your password to confirm/));
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Delete my account' }).disabled).toBe(false);
  });

  it('shows any other failure as an alert', async () => {
    auth.deleteAccount.mockRejectedValue(new Error('offline'));
    settings();
    startDelete();
    type(/^Enter your password to confirm/, 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Couldn’t reach the server.');
  });

  it('ends the session and closes on a 401', async () => {
    auth.deleteAccount.mockRejectedValue(new ApiError(401, 'Unauthorized'));
    const { onClose, onDeleted } = settings();
    startDelete();
    type(/^Enter your password to confirm/, 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(auth.endSession).toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
