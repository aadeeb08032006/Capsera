import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiRequest } from '../../services/apiClient.js';

/**
 * Temporary Member 1 Auth Context Stub
 * Will be swapped with Member 1's full auth module when merged.
 * Calls real GET /api/v1/auth/me and provides login/logout methods.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const fetchCurrentUser = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/auth/me', { method: 'GET' });
      setUser(res.data?.user || null);
      setAuthError(null);
    } catch (err) {
      // 401 is normal for unauthenticated guests
      if (err.status !== 401) {
        setAuthError(err.message);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const login = async (email, password) => {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setUser(res.data?.user || null);
    return res.data?.user;
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  };

  const value = {
    user,
    loading,
    authError,
    isAuthenticated: Boolean(user),
    isTrainee: user?.role === 'TRAINEE',
    isTrainer: user?.role === 'TRAINER',
    isAdmin: user?.role === 'ADMIN',
    refetchUser: fetchCurrentUser,
    login,
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
