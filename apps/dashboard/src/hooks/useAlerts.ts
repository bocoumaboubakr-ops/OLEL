'use client';

import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
const WS = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

export function useAlerts() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('olel_token');
    if (!token) return;

    axios
      .get(`${API}/alerts?status=ACTIVE&limit=50`, { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => setAlerts(data.alerts || []))
      .catch(console.error)
      .finally(() => setLoading(false));

    const socket = io(`${WS}/alerts`, { auth: { token } });

    socket.on('alert:new', (alert: any) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 100));
    });

    socket.on('alert:global', (alert: any) => {
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? alert : a)));
    });

    return () => { socket.disconnect(); };
  }, []);

  return { alerts, loading };
}
