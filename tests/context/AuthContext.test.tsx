// @vitest-environment jsdom
import '../helpers/dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../src/context/AuthContext';
import { useAuth } from '../../src/context/useAuth';
import * as api from '../../src/services/apiService';
import { ApiError } from '../../src/services/apiService';
import type { AuthUser } from '../../src/types';
import { deferred, user } from '../helpers/fixtures';

vi.mock('../../src/services/apiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/apiService')>()),
  fetchCurrentUser: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
}));

const fetchCurrentUser = vi.mocked(api.fetchCurrentUser);
const login = vi.mocked(api.login);
const register = vi.mocked(api.register);
const changePassword = vi.mocked(api.changePassword);
const deleteAccount = vi.mocked(api.deleteAccount);

const TOKEN_KEY = 'nova-stream:token';
const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const render = () => renderHook(() => useAuth(), { wrapper });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useAuth', () => {
  it('refuses to work outside the provider', () => {
    // React reports the throw before rethrowing it; only the rethrow matters here.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reported = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener('error', reported);
    expect(() => renderHook(() => useAuth())).toThrow(/within an AuthProvider/);
    window.removeEventListener('error', reported);
    quiet.mockRestore();
  });
});

describe('AuthProvider with a stored token', () => {
  beforeEach(() => {
    localStorage.setItem(TOKEN_KEY, 'stored');
  });

  it('checks it with the server, then signs in', async () => {
    const check = deferred<{ user: AuthUser }>();
    fetchCurrentUser.mockReturnValue(check.promise);
    const { result } = render();
    expect(result.current.status).toBe('checking');
    expect(fetchCurrentUser).toHaveBeenCalledWith('stored');

    await act(async () => check.resolve({ user }));
    expect(result.current).toMatchObject({ status: 'signedIn', user, token: 'stored' });
  });

  it('ends the session when the server says it is over, explaining why', async () => {
    fetchCurrentUser.mockRejectedValue(new ApiError(401, 'Unauthorized'));
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(result.current.token).toBeNull();
    expect(result.current.sessionNotice).toBe('Your session expired. Sign in again to see your saved titles.');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('keeps the token through a network blip, and can check again', async () => {
    fetchCurrentUser.mockRejectedValueOnce(new Error('offline'));
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('unreachable'));
    expect(result.current.token).toBe('stored');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('stored');

    fetchCurrentUser.mockResolvedValueOnce({ user });
    await act(() => result.current.refreshUser());
    expect(result.current.status).toBe('signedIn');
  });

  it('ignores a slow check once that session has been replaced', async () => {
    const check = deferred<{ user: AuthUser }>();
    fetchCurrentUser.mockReturnValue(check.promise);
    const { result } = render();
    act(() => result.current.logout());

    await act(async () => check.reject(new ApiError(401, 'Unauthorized')));
    expect(result.current.status).toBe('signedOut');
    expect(result.current.sessionNotice).toBeNull();
  });

  it('signing out clears the session here and in storage', async () => {
    fetchCurrentUser.mockResolvedValue({ user });
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('signedIn'));

    act(() => result.current.logout());
    expect(result.current).toMatchObject({ status: 'signedOut', user: null, token: null, sessionNotice: null });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('follows sign-out and sign-in from another tab', async () => {
    fetchCurrentUser.mockResolvedValue({ user });
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('signedIn'));

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_KEY, newValue: null }));
    });
    expect(result.current).toMatchObject({ status: 'signedOut', user: null, token: null });

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: 'x' }));
    });
    expect(result.current.status).toBe('signedOut');

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_KEY, newValue: 'other-tab' }));
    });
    await waitFor(() => expect(fetchCurrentUser).toHaveBeenLastCalledWith('other-tab'));
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
  });

  it('changing the password swaps in the new token; deleting the account ends the session', async () => {
    fetchCurrentUser.mockResolvedValue({ user });
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('signedIn'));

    changePassword.mockResolvedValue({ token: 'rotated', user });
    await act(() => result.current.changePassword('old-password', 'new-password'));
    expect(changePassword).toHaveBeenCalledWith('stored', 'old-password', 'new-password');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('rotated');

    deleteAccount.mockResolvedValue(undefined);
    await act(() => result.current.deleteAccount('new-password'));
    expect(deleteAccount).toHaveBeenCalledWith('rotated', 'new-password');
    expect(result.current.status).toBe('signedOut');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe('AuthProvider with no token', () => {
  it('is signed out without asking the server', () => {
    const { result } = render();
    expect(result.current.status).toBe('signedOut');
    expect(fetchCurrentUser).not.toHaveBeenCalled();
  });

  it('survives browser storage that throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(render().result.current.status).toBe('signedOut');
    getItem.mockRestore();
  });

  it('signs in, storing the token and clearing any earlier notice', async () => {
    login.mockResolvedValue({ token: 'fresh', user });
    const { result } = render();
    act(() => result.current.endSession('Expired'));
    expect(result.current.sessionNotice).toBe('Expired');

    await act(() => result.current.login('ana@example.com', 'password1'));
    expect(result.current).toMatchObject({ status: 'signedIn', token: 'fresh', user, loading: false, error: null });
    expect(result.current.sessionNotice).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBe('fresh');
  });

  it('rethrows a failed sign-in and keeps the message until cleared', async () => {
    login.mockRejectedValue(new ApiError(400, 'Wrong email or password.'));
    const { result } = render();

    await act(async () => {
      await expect(result.current.login('a@b.co', 'password1')).rejects.toBeInstanceOf(ApiError);
    });
    expect(result.current).toMatchObject({ error: 'Wrong email or password.', loading: false, status: 'signedOut' });

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it('words a rate-limited sign-up as sign-up attempts', async () => {
    register.mockRejectedValue(new ApiError(429, 'Slow down', 'rate_limited', 120));
    const { result } = render();
    await act(async () => {
      await expect(result.current.register('a@b.co', 'password1', 'A')).rejects.toBeInstanceOf(ApiError);
    });
    expect(result.current.error).toBe('Too many sign-up attempts. Try again in 2 minutes.');
  });

  it('refuses account changes with no session', async () => {
    const { result } = render();
    await expect(result.current.changePassword('a', 'b')).rejects.toThrow('Not signed in');
    await expect(result.current.deleteAccount('a')).rejects.toThrow('Not signed in');
    expect(changePassword).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});
