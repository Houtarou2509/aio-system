import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  twoFactorEnabled: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requiresTwoFactor: boolean;
  pendingTwoFactorUserId: string | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string, twoFactorToken?: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  setup2Fa: () => Promise<{ secret: string; otpauthUrl: string }>;
  verify2Fa: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: true,
    requiresTwoFactor: false,
    pendingTwoFactorUserId: null,
  });

  const storeTokens = (accessToken: string, refreshToken: string) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  };

  const clearTokens = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  };

  const login = useCallback(async (email: string, password: string, twoFactorToken?: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, twoFactorToken }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Login failed');
    if (data.data.requiresTwoFactor) {
      setState(prev => ({
        ...prev,
        requiresTwoFactor: true,
        pendingTwoFactorUserId: data.data.userId,
      }));
      return;
    }
    storeTokens(data.data.accessToken, data.data.refreshToken);
    setState({
      user: data.data.user,
      accessToken: data.data.accessToken,
      refreshToken: data.data.refreshToken,
      isAuthenticated: true,
      isLoading: false,
      requiresTwoFactor: false,
      pendingTwoFactorUserId: null,
    });
  }, []);

  const logout = useCallback(async () => {
    const rt = localStorage.getItem('refreshToken');
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.accessToken}` },
      body: JSON.stringify({ refreshToken: rt }),
    }).catch(() => {});
    clearTokens();
    setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      requiresTwoFactor: false,
      pendingTwoFactorUserId: null,
    });
  }, [state.accessToken]);

  const refreshAuth = useCallback(async () => {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      const data = await res.json();
      if (!data.success) {
        clearTokens();
        setState(prev => ({ ...prev, isAuthenticated: false, user: null, isLoading: false }));
        return;
      }
      storeTokens(data.data.accessToken, data.data.refreshToken);
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${data.data.accessToken}` },
      });
      const meData = await meRes.json();
      if (meData.success) {
        setState(prev => ({
          ...prev,
          accessToken: data.data.accessToken,
          refreshToken: data.data.refreshToken,
          user: meData.data,
          isAuthenticated: true,
          isLoading: false,
        }));
      }
    } catch {
      clearTokens();
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const setup2Fa = useCallback(async () => {
    const token = state.accessToken || localStorage.getItem('accessToken');
    const res = await fetch('/api/auth/2fa/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || '2FA setup failed');
    return data.data;
  }, [state.accessToken]);

  const verify2Fa = useCallback(async (token: string) => {
    const at = state.accessToken || localStorage.getItem('accessToken');
    const res = await fetch('/api/auth/2fa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${at}` },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || '2FA verification failed');
  }, [state.accessToken]);

  useEffect(() => {
    if (!state.isAuthenticated) return;
    const interval = setInterval(refreshAuth, 14 * 60 * 1000);
    return () => clearInterval(interval);
  }, [state.isAuthenticated, refreshAuth]);

  useEffect(() => {
    const at = localStorage.getItem('accessToken');
    const rt = localStorage.getItem('refreshToken');
    if (at && rt) {
      refreshAuth();
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshAuth, setup2Fa, verify2Fa }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
