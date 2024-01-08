import { createContext, useContext } from 'react';
import type { AuthUser } from '../types';

/**
 * - checking: a stored token is being confirmed with the server
 * - unreachable: a token is stored but the server couldn't confirm it; it's kept, not dropped
 */
export type SessionStatus = 'signedOut' | 'checking' | 'signedIn' | 'unreachable';

export interface AuthContextValue {
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
  /** Rejects with the API error; on success this device stays signed in and others are signed out. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Rejects with the API error; on success the session ends. */
  deleteAccount: (password: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Call when an account request answers 401: signs out and explains why (optionally, what didn't happen). */
  endSession: (message?: string) => void;
  clearSessionNotice: () => void;
  /** Drops the last sign-in or sign-up error, e.g. when the form switches mode. */
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
