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

    socket.on('alert:new', (alert: any) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 200));
    });

    socket.on('alert:global', (updated: any) => {
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
    });

    return () => { socket.disconnect(); };
  }, [fetchAlerts]);

  return { alerts, loading, refetch: fetchAlerts };
}
