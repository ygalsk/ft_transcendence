import React, { createContext, useEffect, useMemo, useState, useCallback } from 'react';
import { authService } from '../services/authService';

export type AuthUser = {
  id?: number | string;
  email?: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  online?: number | boolean;
  last_seen?: string;
  wins?: number;
  losses?: number;
  [key: string]: unknown;
};

type AuthContextValue = {
  user: AuthUser | null;
  setUser: (u: AuthUser | null) => void;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  setUser: () => {},
  isAuthenticated: false,
  loading: false,
  error: null,
  refresh: async () => {},
  logout: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await authService.me<Record<string, unknown>>();
      const normalized = (profile as any)?.user ?? (profile as any)?.data ?? profile;
      setUser(normalized as AuthUser);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      // Treat 401/404 as not authenticated without showing error
      if (status === 401 || status === 404) {
        setUser(null);
        setError(null);
      } else {
        setUser(null);
        setError(e?.message ?? 'Failed to load user');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial hydration on mount
    refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      user,
      setUser,
      isAuthenticated: !!user,
      loading,
      error,
      refresh,
      logout,
    };
  }, [user, loading, error, refresh, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Keep default export for any legacy default imports
export default AuthContext;