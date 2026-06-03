'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

type Tab = 'users' | 'zones' | 'audit' | 'flags';

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('users');

  if (!user) return null;
  if (!['ADMIN', 'PREFECTURE'].includes(user.role)) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>Accès non autorisé</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <header style={{ background: '#1a3c5e', color: 'white', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: '0.85rem' }}>← Dashboard</a>
          <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>⚙️ Administration OLEL</span>
        </div>
        <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>{user.name} · {user.role}</span>
      </header>

      <div style={{ display: 'flex' }}>
        {/* Nav latérale */}
        <nav style={{ width: 200, background: 'white', borderRight: '1px solid #e2e8f0', minHeight: 'calc(100vh - 50px)', padding: '16px 0' }}>
          {([
            { key: 'users', icon: '👥', label: 'Utilisateurs' },
            { key: 'zones', icon: '📍', label: 'Zones' },
            { key: 'audit', icon: '📋', label: 'Logs d\'audit' },
            { key: 'flags', icon: '🚩', label: 'Feature Flags' },
          ] as const).map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                width: '100%',
                padding: '10px 20px',
                border: 'none',
                background: tab === key ? '#e8f0fe' : 'transparent',
                color: tab === key ? '#1a3c5e' : '#64748b',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '0.88rem',
                fontWeight: tab === key ? 700 : 400,
                borderLeft: tab === key ? '3px solid #1a3c5e' : '3px solid transparent',
              }}
            >
              {icon} {label}
            </button>
          ))}
        </nav>

        <main style={{ flex: 1, padding: 24 }}>
          {tab === 'users' && <UsersTab />}
          {tab === 'zones' && <ZonesTab />}
          {tab === 'audit' && <AuditTab />}
          {tab === 'flags' && <FlagsTab />}
        </main>
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('olel_token')}` });

  useEffect(() => {
    axios.get(`${API}/users?limit=100`, { headers: auth() })
      .then(({ data }) => setUsers(data.users || []))
      .finally(() => setLoading(false));
  }, []);

  const toggleActive = async (id: string, isActive: boolean) => {
    await axios.patch(`${API}/users/${id}`, { isActive: !isActive }, { headers: auth() });
    setUsers((u) => u.map((x) => (x.id === id ? { ...x, isActive: !isActive } : x)));
  };

  return (
    <div>
      <h2 style={{ marginTop: 0, color: '#1a3c5e' }}>👥 Utilisateurs ({users.length})</h2>
      {loading ? <p>Chargement…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <thead>
            <tr style={{ background: '#f8fafc', fontSize: '0.78rem', color: '#64748b' }}>
              {['Nom', 'Téléphone', 'Rôle', 'Zone', 'Statut', 'Action'].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{u.name}</td>
                <td style={{ padding: '10px 14px', color: '#64748b' }}>{u.phone}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 8, background: '#e8f0fe', color: '#1a3c5e', fontSize: '0.75rem', fontWeight: 600 }}>{u.role}</span>
                </td>
                <td style={{ padding: '10px 14px', color: '#64748b' }}>{u.zoneId ? '📍' : '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 8, background: u.isActive ? '#dcfce7' : '#fee2e2', color: u.isActive ? '#16a34a' : '#dc2626', fontSize: '0.75rem' }}>
                    {u.isActive ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button
                    onClick={() => toggleActive(u.id, u.isActive)}
                    style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: 'pointer', background: 'white' }}
                  >
                    {u.isActive ? 'Désactiver' : 'Activer'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ZonesTab() {
  const [zones, setZones] = useState<any[]>([]);
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('olel_token')}` });

  useEffect(() => {
    axios.get(`${API}/zones`, { headers: auth() }).then(({ data }) => setZones(data));
  }, []);

  return (
    <div>
      <h2 style={{ marginTop: 0, color: '#1a3c5e' }}>📍 Zones ({zones.length})</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {zones.map((z) => (
          <div key={z.id} style={{ background: 'white', padding: 16, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>📍 {z.name}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
              <div>Code : {z.code}</div>
              <div>Région : {z.region}</div>
              <div>Utilisateurs : {z._count?.users ?? '—'}</div>
              <div>Alertes : {z._count?.alerts ?? '—'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('olel_token')}` });

  useEffect(() => {
    axios.get(`${API}/audit?limit=50`, { headers: auth() }).then(({ data }) => setLogs(data));
  }, []);

  return (
    <div>
      <h2 style={{ marginTop: 0, color: '#1a3c5e' }}>📋 Logs d'audit</h2>
      <div style={{ background: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {logs.map((log) => (
          <div key={log.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span><strong>{log.action}</strong> · {log.resource}{log.resourceId ? ` #${log.resourceId.slice(0, 8)}` : ''}</span>
              <span style={{ color: '#94a3b8' }}>{new Date(log.createdAt).toLocaleString('fr-FR')}</span>
            </div>
            {log.user && <div style={{ color: '#64748b', marginTop: 2 }}>Par : {log.user.name} ({log.user.phone})</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FlagsTab() {
  return (
    <div>
      <h2 style={{ marginTop: 0, color: '#1a3c5e' }}>🚩 Feature Flags</h2>
      <p style={{ color: '#64748b' }}>Gestion des fonctionnalités activables/désactivables à chaud.</p>
      <div style={{ background: '#fef3c7', padding: 16, borderRadius: 8, color: '#92400e', fontSize: '0.88rem' }}>
        Les feature flags sont gérés directement en base (table <code>feature_flags</code>). Endpoint API à implémenter en V2.
      </div>
    </div>
  );
}
