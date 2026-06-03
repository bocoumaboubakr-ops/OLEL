'use client';

import { useState } from 'react';
import { ReportForm } from '@/components/report/ReportForm';
import { AlertsList } from '@/components/alerts/AlertsList';

type Tab = 'report' | 'alerts' | 'map';

export default function MobilePage() {
  const [tab, setTab] = useState<Tab>('alerts');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header style={{ background: '#1a3c5e', color: 'white', padding: '16px', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.2rem' }}>🚨 OLEL</h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.8 }}>Plateforme d'alerte précoce</p>
      </header>

      <main style={{ flex: 1, padding: '16px' }}>
        {tab === 'report' && <ReportForm />}
        {tab === 'alerts' && <AlertsList />}
        {tab === 'map' && <MapPlaceholder />}
      </main>

      <nav style={{ background: 'white', borderTop: '1px solid #eee', display: 'flex', position: 'sticky', bottom: 0 }}>
        {[
          { key: 'alerts', icon: '🔔', label: 'Alertes' },
          { key: 'report', icon: '📢', label: 'Signaler' },
          { key: 'map', icon: '🗺️', label: 'Carte' },
        ].map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key as Tab)}
            style={{
              flex: 1,
              padding: '12px 4px',
              border: 'none',
              background: tab === key ? '#e8f0fe' : 'transparent',
              color: tab === key ? '#1a3c5e' : '#888',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: tab === key ? 700 : 400,
            }}
          >
            <div style={{ fontSize: '1.3rem' }}>{icon}</div>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function MapPlaceholder() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#888' }}>
      <div style={{ fontSize: '3rem', marginBottom: 12 }}>🗺️</div>
      <p>Carte en cours de chargement...</p>
      <p style={{ fontSize: '0.85rem' }}>Tuiles offline disponibles après la première connexion.</p>
    </div>
  );
}
