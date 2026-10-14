'use client';

import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
const WS = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

export function useAlerts() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    const token = localStorage.getItem('olel_token');
    if (!token) return;
    try {
      const { data } = await axios.get(`${API}/alerts?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlerts(data.alerts || []);
    } catch (e: any) {
      if (e?.response?.status === 401) {
        localStorage.removeItem('olel_token');
        localStorage.removeItem('olel_refresh');
        localStorage.removeItem('olel_user');
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();

    const token = localStorage.getItem('olel_token');
    if (!token) return;

    const socket = io(`${WS}/alerts`, { auth: { token } });

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
    socket.on('disconnect', (reason) => { if (reason === 'io server disconnect') fetchAlerts(); });

    return () => { if (timer) clearTimeout(timer); socket.disconnect(); };
  }, [fetchAlerts]);

  return { alerts, loading, refetch: fetchAlerts };
}
