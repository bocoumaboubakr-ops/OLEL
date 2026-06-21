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

  const diffusees = alerts.filter((a) => a.status === 'BROADCAST' || a.status === 'BROADCASTING' || a.status === 'ACTIVE').length;
  const enCours = alerts.filter((a) => ['PENDING', 'UNDER_REVIEW', 'VALIDATED'].includes(a.status)).length;
  const urgent = alerts.filter((a) => a.severity === 3 && !['CLOSED', 'RESOLVED', 'REJECTED', 'CANCELLED'].includes(a.status)).length;

  const items = [
    { label: 'Diffusées',         value: stats?.alertsActive ?? diffusees, accent: '#16A34A' },
    { label: 'En traitement',     value: stats?.signalementsPending ?? enCours, accent: '#A16207' },
    { label: 'Urgence',           value: urgent, accent: '#DC2626' },
    { label: 'Total (30 j)',      value: stats?.alertsLast30Days ?? '—', accent: '#0F172A' },
    { label: 'Notifications',     value: stats?.notificationsSent ?? '—', accent: '#0F172A' },
  ];

  return (
    <div style={{
      background: 'white',
      borderBottom: '1px solid #F1F5F9',
      padding: '12px 24px',
      display: 'flex', gap: 32, flexShrink: 0,
    }}>
      {items.map(({ label, value, accent }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: '1.35rem', fontWeight: 700, color: accent, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</span>
          <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500 }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
