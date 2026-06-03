'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export function StatsBar({ alerts }: { alerts: any[] }) {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('olel_token');
    if (!token) return;
    axios
      .get(`${API}/stats/summary`, { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => setStats(data))
      .catch(() => {});
  }, [alerts.length]);

  const active = alerts.filter((a) => a.status === 'ACTIVE').length;
  const pending = alerts.filter((a) => a.status === 'PENDING').length;
  const urgent = alerts.filter((a) => a.severity === 3).length;

  const items = [
    { label: 'Alertes actives', value: stats?.alertsActive ?? active, color: '#16a34a', bg: '#dcfce7' },
    { label: 'En validation', value: stats?.signalementsPending ?? pending, color: '#92400e', bg: '#fef3c7' },
    { label: 'Niveau urgence', value: urgent, color: '#dc2626', bg: '#fee2e2' },
    { label: 'Total (30j)', value: stats?.alertsLast30Days ?? '—', color: '#1d4ed8', bg: '#dbeafe' },
    { label: 'Notif. envoyées', value: stats?.notificationsSent ?? '—', color: '#7c3aed', bg: '#ede9fe' },
  ];

  return (
    <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 24px', display: 'flex', gap: 16, flexShrink: 0 }}>
      {items.map(({ label, value, color, bg }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 8, background: bg }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, color }}>{value}</span>
          <span style={{ fontSize: '0.72rem', color: '#64748b', maxWidth: 70, lineHeight: 1.2 }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
