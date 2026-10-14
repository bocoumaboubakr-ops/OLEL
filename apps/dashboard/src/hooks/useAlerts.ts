'use client';

import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
const WS = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

export function useAlerts() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguer « liste indisponible » de « aucune alerte » (audit F16)
  const [unavailable, setUnavailable] = useState(false);

  const fetchAlerts = useCallback(async () => {
    const token = localStorage.getItem('olel_token');
    if (!token) return;
    try {
      const { data } = await axios.get(`${API}/alerts?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlerts(data.alerts || []);
      setUnavailable(false);
    } catch {
      // 401 : renouvellement automatique (lib/session) ; session perdue → redirection gérée par useAuth
      setUnavailable(true);
      return;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();

    const token = localStorage.getItem('olel_token');
    if (!token) return;

    // Le jeton est relu à chaque (re)connexion : il change à chaque renouvellement
    const socket = io(`${WS}/alerts`, { auth: (cb) => cb({ token: localStorage.getItem('olel_token') }) });

    // Le serveur n'envoie qu'un résumé minimal (audit F02) : la liste fait
    // foi via l'API, qui applique le cloisonnement territorial. On recharge
    // donc la liste (regroupé sur 1 s) au lieu de fusionner le contenu reçu.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchAlerts, 1000);
    };
    socket.on('alert:changed', scheduleRefetch);
    // Session révoquée ou expirée : le serveur coupe la connexion ; le
    // rechargement renverra 401 et redirigera vers la connexion.
    socket.on('disconnect', (reason) => {
      if (reason !== 'io server disconnect') return;
      // Coupure par le serveur (jeton expiré/révoqué) : rafraîchir la liste
      // (renouvelle la session si possible) puis se reconnecter avec le nouveau jeton
      fetchAlerts().then(() => { if (localStorage.getItem('olel_token')) socket.connect(); });
    });

    return () => { if (timer) clearTimeout(timer); socket.disconnect(); };
  }, [fetchAlerts]);

  return { alerts, loading, unavailable, refetch: fetchAlerts };
}
