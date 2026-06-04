'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface AuthUser {
  id: string;
  name: string;
  phone: string;
  role: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('olel_user');
    if (stored) setUser(JSON.parse(stored));
    setInitialized(true);
  }, []);

  const login = async (phone: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.post(`${API}/auth/login`, { phone, password });
      localStorage.setItem('olel_token', data.accessToken);
      localStorage.setItem('olel_refresh', data.refreshToken);
      localStorage.setItem('olel_user', JSON.stringify(data.user));
      setUser(data.user);
      window.location.href = '/';
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('olel_token');
    localStorage.removeItem('olel_refresh');
    localStorage.removeItem('olel_user');
    setUser(null);
    window.location.href = '/login';
  };

  return { user, initialized, login, logout, loading, error };
}
