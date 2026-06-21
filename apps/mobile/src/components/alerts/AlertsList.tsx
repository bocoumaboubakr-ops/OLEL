'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export function AlertsList() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('olel_token');
    axios
      .get(`${API}/alerts?status=ACTIVE&limit=30`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then(({ data }) => setAlerts(data.alerts || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Chargement...</div>;

  if (!alerts.length) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#888' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
        <p>Aucune alerte active dans votre zone.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginTop: 0, color: '#1a3c5e' }}>🔔 Alertes actives ({alerts.length})</h2>
      {alerts.map((alert) => (
        <div
          key={alert.id}
          style={{
            background: 'white',
            borderRadius: 8,
            padding: 16,
            marginBottom: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            borderLeft: `4px solid ${alert.severity >= 3 ? '#ef4444' : alert.severity === 2 ? '#f59e0b' : '#22c55e'}`,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{alert.title}</div>
          <p style={{ margin: '0 0 8px', color: '#555', fontSize: '0.9rem' }}>{alert.description}</p>
          <div style={{ fontSize: '0.8rem', color: '#888' }}>
            📍 {alert.zone?.name || 'Zone inconnue'} •{' '}
            {new Date(alert.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ))}
    </div>
  );
}
