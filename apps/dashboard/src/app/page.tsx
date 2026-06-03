'use client';

import { useEffect, useState } from 'react';
import { AlertsFeed } from '@/components/alerts/AlertsFeed';
import { AlertMap } from '@/components/map/AlertMap';
import { useAlerts } from '@/hooks/useAlerts';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const { alerts, loading } = useAlerts();

  if (!user) {
    return <LoginRedirect />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ background: '#1a3c5e', color: 'white', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>🚨 OLEL – Tableau de Bord</h1>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontSize: '0.9rem' }}>{user.name} ({user.role})</span>
          <button onClick={logout} style={{ background: '#e74c3c', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer' }}>
            Déconnexion
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{ width: 360, overflowY: 'auto', borderRight: '1px solid #ddd', background: 'white' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #eee' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Alertes actives</h2>
            <span style={{ color: '#888', fontSize: '0.85rem' }}>{alerts.length} alerte(s)</span>
          </div>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>Chargement...</div>
          ) : (
            <AlertsFeed alerts={alerts} />
          )}
        </aside>

        <main style={{ flex: 1, position: 'relative' }}>
          <AlertMap alerts={alerts} />
        </main>
      </div>
    </div>
  );
}

function LoginRedirect() {
  useEffect(() => { window.location.href = '/login'; }, []);
  return null;
}
