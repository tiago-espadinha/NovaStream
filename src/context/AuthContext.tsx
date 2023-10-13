import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as api from '../services/apiService';
import type { AuthUser } from '../types';
import { describeAccountError, isSessionEnded } from '../utils/accountErrors';

const TOKEN_KEY = 'nova-stream:token';

/**
 * - checking: a stored token is being confirmed with the server
 * - unreachable: a token is stored but the server couldn't confirm it; it's kept, not dropped
 */
export type SessionStatus = 'signedOut' | 'checking' | 'signedIn' | 'unreachable';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  status: SessionStatus;
  loading: boolean;
  error: string | null;
  /** Why the user was signed out without asking, e.g. an expired session. */
  sessionNotice: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  /** Call when an account request answers 401: signs out and explains why (optionally, what didn't happen). */
  endSession: (message?: string) => void;
  clearSessionNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Without storage the session lasts for this page only.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readToken);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>(() => (token ? 'checking' : 'signedOut'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const startSession = useCallback((nextToken: string, nextUser: AuthUser) => {
    writeToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setStatus('signedIn');
    setSessionNotice(null);
  }, []);

  const clearSession = useCallback(() => {
    writeToken(null);
    setToken(null);
    setUser(null);
    setStatus('signedOut');
  }, []);

  const endSession = useCallback(
    (message = 'Your session expired. Sign in again to see your saved titles.') => {
      clearSession();
      setSessionNotice(message);
    },
    [clearSession],
  );

  // The token in effect right now, so a slow check can tell it has been superseded.
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const refreshUser = useCallback(async () => {
    if (!token) return;
    setStatus('checking');
    try {
      const { user } = await api.fetchCurrentUser(token);
      if (tokenRef.current !== token) return;
      setUser(user);
      setStatus('signedIn');
    } catch (err) {
      if (tokenRef.current !== token) return;
      // Only the server saying the session is over ends it; a network blip keeps the token.
      if (isSessionEnded(err)) endSession();
      else setStatus('unreachable');
    }
  }, [token, endSession]);

  useEffect(() => {
    if (token && !user) refreshUser();
  }, [token, user, refreshUser]);

  // Keep tabs consistent: signing in or out in one tab applies to the others.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== TOKEN_KEY || event.newValue === token) return;
      setUser(null);
      setToken(event.newValue);
      setStatus(event.newValue ? 'checking' : 'signedOut');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [token]);

  const authenticate = useCallback(
    async (request: () => Promise<api.AuthResponse>, fallback: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await request();
        startSession(res.token, res.user);
      } catch (err) {
        setError(describeAccountError(err, fallback));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [startSession],
  );

  const login = useCallback(
    (email: string, password: string) => authenticate(() => api.login(email, password), 'Sign-in failed. Try again.'),
    [authenticate],
  );

  const register = useCallback(
    (email: string, password: string, name?: string) =>
      authenticate(() => api.register(email, password, name), 'Couldn’t create your account. Try again.'),
    [authenticate],
  );

  const clearSessionNotice = useCallback(() => setSessionNotice(null), []);

  const value = useMemo(
    () => ({
      user,
      token,
      status,
      loading,
      error,
      sessionNotice,
      login,
      register,
      logout: clearSession,
      refreshUser,
      endSession,
      clearSessionNotice,
    }),
    [user, token, status, loading, error, sessionNotice, login, register, clearSession, refreshUser, endSession, clearSessionNotice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
