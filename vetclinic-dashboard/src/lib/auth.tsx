'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiLogin, User } from './api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: async () => {},
  logout: () => {},
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('dashboard_token') : null;
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('dashboard_user') : null;
    if (stored && storedUser) {
      setToken(stored);
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    const allowedRoles = ['VETERINARIAN', 'ADMIN', 'STAFF'];
    if (!allowedRoles.includes(data.user.role)) {
      throw new Error('Accès réservé aux vétérinaires, administrateurs et staff');
    }
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('dashboard_token', data.token);
    localStorage.setItem('dashboard_user', JSON.stringify(data.user));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('dashboard_token');
    localStorage.removeItem('dashboard_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
