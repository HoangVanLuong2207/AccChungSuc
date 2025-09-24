import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isAuthenticating: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

interface AuthStatusResponse {
  loggedIn: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const data = await apiRequest<AuthStatusResponse>('GET', '/api/auth/status');
        setIsAuthenticated(data.loggedIn);
      } catch (e) {
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuthStatus();
  }, []);

  const login = async (username: string, password: string) => {
    console.log('Attempting to login with:', { username });
    setError(null);
    setIsAuthenticating(true);
    try {
      // If the apiRequest promise resolves, it means the login was successful (status 2xx).
      // The function throws an error for non-2xx statuses, which is caught below.
      await apiRequest('POST', '/api/login', { username, password });
      console.log('Login request successful. Setting authenticated state.');
      setIsAuthenticated(true);
    } catch (e: any) {
      console.error('Login failed with error:', e);
      setError(e.message || 'Đăng nhập thất bại');
      setIsAuthenticated(false);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const logout = async () => {
    try {
      await apiRequest('POST', '/api/logout');
      setIsAuthenticated(false);
    } catch (e) {
      console.error('Đăng xuất thất bại', e);
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, isAuthenticating, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
