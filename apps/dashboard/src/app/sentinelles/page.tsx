'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
const AUTH_ROLES = ['MAIRIE', 'PREFECTURE', 'GOUVERNORAT', 'PROTECTION_CIVILE', 'ADMIN', 'SUPER_ADMIN'];

type STab = 'sentinelles' | 'missions';

export default function SentinellesPage() {
  const { user, initialized } = useAuth();
  const [tab, setTab] = useState<STab>('sentinelles');

  if (!initialized) return null;
  if (!user) { if (typeof window !== 'undefined') window.location.href = '/login'; return null; }
  if (!AUTH_ROLES.includes(user.role)) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>Accès non autorisé</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ background: '#1a3c5e', color: 'white', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: '0.85rem' }}>← Tableau de bord</a>
          <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>🔭 Sentinelles & Missions</span>
        </div>
        <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>{user.name} · {user.role}</span>
      </header>

      <div style={{ display: 'flex', gap: 8, padding: '16px 24px 0' }}>
        {([
          { key: 'sentinelles', label: '🔭 Sentinelles' },
          { key: 'missions',    label: '📋 Missions terrain' },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding: '8px 18px', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontWeight: tab === key ? 700 : 400, background: tab === key ? 'white' : '#e2e8f0', color: tab === key ? '#1a3c5e' : '#64748b', borderBottom: tab === key ? '2px solid #1a3c5e' : '2px solid transparent' }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ background: 'white', margin: '0 0 0 0', borderTop: '1px solid #e2e8f0', padding: '24px' }}>
        {tab === 'sentinelles' && <SentinellesTab />}
        {tab === 'missions'    && <MissionsPanel />}
      </div>
    </div>
  );
}

function SentinellesTab() {
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('olel_token')}` });
  const [sentinelles, setSentinelles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/users?role=SENTINELLE&limit=200`, { headers: auth() })
      .then(({ data }) => setSentinelles(data.users || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>;

  const active = sentinelles.filter((s) => s.isActive);
  const inactive = sentinelles.filter((s) => !s.isActive);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24, maxWidth: 600 }}>
        <StatCard value={sentinelles.length} label="Total sentinelles" color="#1a3c5e" />
        <StatCard value={active.length} label="Actives" color="#16a34a" />
        <StatCard value={inactive.length} label="Inactives" color="#dc2626" />
      </div>

      <h3 style={{ fontSize: '0.9rem', color: '#1a3c5e', marginBottom: 12 }}>Liste des sentinelles</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '0.78rem' }}>
            {['Nom', 'Téléphone', 'Zone', 'Statut', 'Dernière activité'].map((h) => (
              <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sentinelles.map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1a3c5e' }}>{s.name}</td>
              <td style={{ padding: '10px 12px', color: '#64748b' }}>{s.phone}</td>
              <td style={{ padding: '10px 12px', color: '#64748b' }}>{s.zone?.name || '—'}</td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{ padding: '2px 8px', borderRadius: 8, background: s.isActive ? '#dcfce7' : '#fee2e2', color: s.isActive ? '#16a34a' : '#dc2626', fontSize: '0.75rem', fontWeight: 600 }}>
                  {s.isActive ? '✅ Active' : '⏸ Inactive'}
                </span>
              </td>
              <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '0.78rem' }}>
                {s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MissionsPanel() {
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('olel_token')}` });
  const [missions, setMissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', type: 'VERIFICATION', dueAt: '' });
  const [saving, setSaving] = useState(false);

  const fetchMissions = () => {
    axios.get(`${API}/missions`, { headers: auth() })
      .then(({ data }) => setMissions(data || []))
      .finally(() => setLoading(false));
  };
  useEffect(fetchMissions, []);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/missions`, { ...form, dueAt: form.dueAt || undefined }, { headers: auth() });
      setShowForm(false);
      setForm({ title: '', description: '', type: 'VERIFICATION', dueAt: '' });
      fetchMissions();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const STATUS_COLOR: Record<string, string> = { OPEN: '#64748b', ASSIGNED: '#2563eb', IN_PROGRESS: '#ea580c', DONE: '#16a34a', CANCELLED: '#94a3b8' };
  const STATUS_LABEL: Record<string, string> = { OPEN: 'Ouverte', ASSIGNED: 'Assignée', IN_PROGRESS: 'En cours', DONE: 'Terminée', CANCELLED: 'Annulée' };
  const TYPE_ICON: Record<string, string> = { VERIFICATION: '🔍', PATROUILLE: '🚶', SENSIBILISATION: '📣', EVACUATION: '🚨' };

  const open = missions.filter((m) => m.status === 'OPEN');
  const inProgress = missions.filter((m) => ['ASSIGNED', 'IN_PROGRESS'].includes(m.status));
  const done = missions.filter((m) => m.status === 'DONE');

  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 5, fontSize: '0.82rem', fontWeight: 600, color: '#374151' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24, maxWidth: 500 }}>
        <StatCard value={open.length} label="Ouvertes" color="#64748b" />
        <StatCard value={inProgress.length} label="En cours" color="#ea580c" />
        <StatCard value={done.length} label="Terminées" color="#16a34a" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#1a3c5e' }}>Toutes les missions</h3>
        <button onClick={() => setShowForm(!showForm)}
          style={{ background: '#1a3c5e', color: 'white', border: 'none', padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
          {showForm ? '✕ Annuler' : '+ Créer une mission'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 18, marginBottom: 20, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Titre</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} placeholder="Ex: Vérification zone inondable nord" />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle}>
                {['VERIFICATION', 'PATROUILLE', 'SENSIBILISATION', 'EVACUATION'].map((t) => (
                  <option key={t} value={t}>{TYPE_ICON[t]} {t}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Instructions</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Instructions terrain détaillées…" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Échéance (optionnel)</label>
            <input type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} style={{ ...inputStyle, maxWidth: 300 }} />
          </div>
          <button disabled={saving || !form.title.trim()} onClick={handleCreate}
            style={{ background: '#ea580c', color: 'white', border: 'none', padding: '9px 22px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Création…' : '📋 Créer'}
          </button>
        </div>
      )}

      {loading ? <p>Chargement…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {missions.map((m) => {
            const color = STATUS_COLOR[m.status] || '#888';
            return (
              <div key={m.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', borderLeft: `4px solid ${color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#1a3c5e', fontSize: '0.92rem' }}>{TYPE_ICON[m.type] || '📋'} {m.title}</div>
                    {m.description && <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: 3 }}>{m.description}</div>}
                  </div>
                  <span style={{ padding: '2px 10px', borderRadius: 8, background: color + '22', color, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {STATUS_LABEL[m.status] || m.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem', color: '#94a3b8' }}>
                  <span>📍 {m.zone?.name || 'Matam'}</span>
                  {m.dueAt && <span>⏰ {new Date(m.dueAt).toLocaleDateString('fr-FR')}</span>}
                  <span>{m.assignments?.length || 0} sentinelle(s) assignée(s)</span>
                  {m.assignments?.length > 0 && (
                    <span>👤 {m.assignments.map((a: any) => a.sentinel?.name).filter(Boolean).join(', ')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ background: 'white', border: `1px solid ${color}33`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: '1.8rem', fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>{label}</div>
    </div>
  );
}
