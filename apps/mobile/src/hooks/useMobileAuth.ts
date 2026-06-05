'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// Timeout pour les zones à faible débit (Matam, réseau mobile instable)
const axiosWithTimeout = axios.create({ timeout: 15000 });

export type AuthMode = 'password' | 'otp_request' | 'otp_verify';

export function useMobileAuth() {
  const [user, setUser] = useState<{ id: string; name: string; phone: string; role: string } | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('olel_user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { /* ignore */ }
    }
    setInitialized(true);
  }, []);

  const _store = (data: { accessToken: string; refreshToken: string; user: any }) => {
    localStorage.setItem('olel_token', data.accessToken);
    localStorage.setItem('olel_refresh', data.refreshToken);
    localStorage.setItem('olel_user', JSON.stringify(data.user));
    setUser(data.user);
  };

  /** Rafraîchit le profil depuis l'API (ex. après activation sentinelle). */
  const refreshProfile = async () => {
    const token = localStorage.getItem('olel_token');
    if (!token) return;
    try {
      const { data } = await axiosWithTimeout.get(`${API}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      localStorage.setItem('olel_user', JSON.stringify(data));
      setUser(data);
    } catch { /* ignore — profil local reste inchangé */ }
  };

  /** Connexion par mot de passe (sentinelles, opérateurs, admin). */
  const login = async (phone: string, password: string) => {
    setLoading(true); setError('');
    try {
      const { data } = await axiosWithTimeout.post(`${API}/auth/login`, { phone, password });
      _store(data);
    } catch (e: any) {
      if (e.code === 'ECONNABORTED') {
        setError('Délai de connexion dépassé — vérifiez votre réseau');
      } else {
        setError(e.response?.data?.message || 'Identifiants incorrects');
      }
    } finally { setLoading(false); }
  };

  /** Demander un OTP (citoyens). Retourne dev_code si env dev. */
  const requestOtp = async (phone: string): Promise<{ dev_code?: string } | null> => {
    setLoading(true); setError('');
    try {
      const { data } = await axiosWithTimeout.post(`${API}/auth/otp/request`, { phone });
      return data; // { message, dev_code? }
    } catch (e: any) {
      if (e.code === 'ECONNABORTED') {
        setError('Délai dépassé — vérifiez votre réseau et réessayez');
      } else {
        setError(e.response?.data?.message || 'Impossible d\'envoyer le code');
      }
      return null;
    } finally { setLoading(false); }
  };

  /** Vérifier le code OTP et se connecter (crée le compte si nouveau). */
  const verifyOtp = async (phone: string, code: string) => {
    setLoading(true); setError('');
    try {
      const { data } = await axiosWithTimeout.post(`${API}/auth/otp/verify`, { phone, code });
      _store(data);
    } catch (e: any) {
      if (e.code === 'ECONNABORTED') {
        setError('Délai dépassé — réessayez');
      } else {
        setError(e.response?.data?.message || 'Code incorrect ou expiré');
      }
    } finally { setLoading(false); }
  };

  const logout = () => {
    localStorage.removeItem('olel_token');
    localStorage.removeItem('olel_refresh');
    localStorage.removeItem('olel_user');
    setUser(null);
  };

  return { user, initialized, loading, error, login, requestOtp, verifyOtp, logout, refreshProfile };
}
