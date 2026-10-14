'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { installAuthRefresh, logoutSession, onSessionLost, storeSession } from '@/lib/session';

// Renouvellement automatique du jeton d'accès (15 min) sur toutes les requêtes axios
installAuthRefresh();

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface AuthUser {
  id: string;
  name: string;
  phone: string;
  role: string;
}

export interface MfaState {
  mfaToken: string;
  /** true = enrôlement requis (1er login) : afficher le secret + QR */
  setupRequired: boolean;
  /** Renseigné après l'appel setup : secret à saisir dans l'app TOTP */
  secret?: string;
  otpauthUrl?: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfa, setMfa] = useState<MfaState | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('olel_user');
    if (stored) { try { setUser(JSON.parse(stored)); } catch { /* profil local illisible */ } }
    setInitialized(true);
    // Session révoquée/suspendue côté serveur : retour à la connexion
    return onSessionLost(() => { setUser(null); window.location.href = '/login'; });
  }, []);

  const login = async (phone: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.post(`${API}/auth/login`, { phone, password });

      // Rôles MAIRIE+ : le backend exige le TOTP avant de délivrer les tokens
      if (data.mfaRequired) {
        setMfa({ mfaToken: data.mfaToken, setupRequired: false });
        return;
      }
      if (data.mfaSetupRequired) {
        // 1er login : générer le secret TOTP pour l'enrôlement
        const setup = await axios.post(`${API}/auth/totp/setup-mfa`, { mfaToken: data.mfaToken });
        setMfa({
          mfaToken: data.mfaToken,
          setupRequired: true,
          secret: setup.data.secret,
          otpauthUrl: setup.data.otpauthUrl,
        });
        return;
      }

      storeSession(data);
      setUser(data.user);
      window.location.href = '/';
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  /** Étape 2 : soumettre le code TOTP (enrôlement ou vérification). */
  const submitTotp = async (code: string) => {
    if (!mfa) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.post(`${API}/auth/totp/login`, {
        mfaToken: mfa.mfaToken,
        code,
      });
      storeSession(data);
      setUser(data.user);
      window.location.href = '/';
    } catch (e: any) {
      const msg = e.response?.data?.message;
      setError(msg || 'Code TOTP incorrect');
      // mfaToken expiré → retour à l'étape mot de passe
      if (e.response?.status === 401 && typeof msg === 'string' && msg.includes('expirée')) {
        setMfa(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const cancelMfa = () => {
    setMfa(null);
    setError(null);
  };

  /** Révoque la session côté serveur puis purge le navigateur (audit F13). */
  const logout = async () => {
    await logoutSession();
    setUser(null);
    window.location.href = '/login';
  };

  return { user, initialized, login, logout, loading, error, mfa, submitTotp, cancelMfa };
}
