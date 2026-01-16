import React, { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { authService } from '../services/authService';

type User = Record<string, any> | null;

type AuthContextType = {
  user: User;
  isAuthenticated: boolean;
  loading: boolean;
  logout: () => Promise<void>;
  setUser?: (u: User) => void;
};

const defaultCtx: AuthContextType = {
  user: null,
  isAuthenticated: false,
  loading: true,
  logout: async () => {},
};

const AuthContext = createContext<AuthContextType>(defaultCtx);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const profile = await authService.me<Record<string, any>>();
        if (mounted) setUser(profile as User);
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    loading,
    logout,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;