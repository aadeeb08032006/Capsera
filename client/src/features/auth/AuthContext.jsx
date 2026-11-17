import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest, TOKEN_STORAGE_KEY } from '../../services/apiClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_STORAGE_KEY) : null;
      if (!token) {
        if (isMounted) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const payload = await apiRequest('/auth/me', { method: 'GET' });
        if (isMounted) {
          setUser(payload.data?.user || null);
        }
      } catch {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        }
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    function handleUnauthorized() {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      if (isMounted) {
        setUser(null);
      }
    }

    window.addEventListener('capsera:unauthorized', handleUnauthorized);

    return () => {
      isMounted = false;
      window.removeEventListener('capsera:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const payload = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (payload?.data?.token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, payload.data.token);
    }
    if (payload?.data?.user) {
      setUser(payload.data.user);
    }
    return payload?.data;
  }, []);

  const signup = useCallback(async ({ fullName, email, password, role }) => {
    const payload = await apiRequest('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ fullName, email, password, role }),
    });
    return payload?.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Discard client session even if API call fails
    } finally {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      setUser(null);
    }
  }, []);

  const value = {
    user,
    loading,
    login,
    signup,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
