import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';
import type { User } from '@/types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchDemoUser: (userId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const u = await api<User>('/auth/me');
      setUser(u);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const u = await api<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setUser(u);
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  };

  const switchDemoUser = async (userId: string) => {
    const u = await api<User>('/auth/demo-switch', { method: 'POST', body: JSON.stringify({ userId }) });
    setUser(u);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, switchDemoUser, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
