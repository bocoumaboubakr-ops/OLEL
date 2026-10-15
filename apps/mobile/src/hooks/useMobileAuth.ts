'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { installAuthRefresh, logoutSession, onSessionLost, storeSession } from '@/lib/session';
import { listQueued, purgeQueued } from '@/hooks/useOfflineQueue';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// Timeout pour les zones à faible débit (Matam, réseau mobile instable)
const axiosWithTimeout = axios.create({ timeout: 15000 });

// Renouvellement automatique du jeton d'accès (15 min) — audit F13
installAuthRefresh(axios);
installAuthRefresh(axiosWithTimeout);

/** Purge des données mises en cache par le navigateur pour ce compte (téléphone partagé). */
async function purgeBrowserCaches() {
  try {
    if (typeof caches !== 'undefined') {
      for (const k of await caches.keys()) if (k.includes('-api')) await caches.delete(k);
    }
  } catch { /* Cache API indisponible */ }
}

export type AuthMode = 'password' | 'otp_request' | 'otp_verify';

export interface MobileUser {
  id: string; name: string; phone: string; role: string;
  /** IN_TRAINING | ACTIVE | SUSPENDED (audit F19) */
  status?: string;
  zoneId?: string | null;
  zone?: { name: string } | null;
  language?: string;
}

export function useMobileAuth() {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('olel_user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { /* ignore */ }
    }
    setInitialized(true);
    // Session révoquée, suspendue ou expirée côté serveur : retour à l'écran de connexion
    return onSessionLost(() => { setUser(null); purgeBrowserCaches(); });
  }, []);

  const _store = (data: { accessToken: string; refreshToken: string; user: any }) => {
    storeSession(data);
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
      if (data.mfaRequired || data.mfaSetupRequired) {
        // Rôles MAIRIE+ : le TOTP n'est géré que sur le dashboard
        setError('Votre rôle exige la double authentification — connectez-vous via le tableau de bord');
        return;
      }
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
      if (data.mfaRequired || data.mfaSetupRequired) {
        setError('Votre rôle exige la double authentification — connectez-vous via le tableau de bord');
        return;
      }
      _store(data);
    } catch (e: any) {
      if (e.code === 'ECONNABORTED') {
        setError('Délai dépassé — réessayez');
      } else {
        setError(e.response?.data?.message || 'Code incorrect ou expiré');
      }
    } finally { setLoading(false); }
  };

  /**
   * Déconnexion (audit F13) : révocation de la session côté serveur, purge
   * des caches du navigateur et, sur confirmation, des signalements en
   * attente de ce compte — rien ne reste réutilisable par le compte suivant.
   */
  const logout = async () => {
    const id = user?.id;
    if (id) {
      const pending = await listQueued(id).catch(() => []);
      if (pending.length && !window.confirm(
        `${pending.length} signalement(s) n'ont pas encore été envoyés.\n`
        + 'Se déconnecter les SUPPRIME de ce téléphone. Continuer ?',
      )) return;
      await purgeQueued(id).catch(() => undefined);
    }
    await logoutSession();
    await purgeBrowserCaches();
    setUser(null);
  };

  return { user, initialized, loading, error, login, requestOtp, verifyOtp, logout, refreshProfile, setUser };
}
