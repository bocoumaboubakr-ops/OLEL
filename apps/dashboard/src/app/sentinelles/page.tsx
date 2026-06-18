'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
const AUTH_ROLES = ['COORDINATEUR', 'MAIRIE', 'PREFECTURE', 'GOUVERNORAT', 'PROTECTION_CIVILE', 'SUPERVISEUR_REGIONAL', 'ADMIN', 'SUPER_ADMIN'];

type STab = 'sentinelles' | 'missions';

export default function SentinellesPage() {
  const { user, initialized } = useAuth();
  const [tab, setTab] = useState<STab>('sentinelles');

  if (!initialized) return null;
  if (!user) { if (typeof window !== 'undefined') window.location.href = '/login'; return null; }
  if (!AUTH_ROLES.includes(user.role)) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#DC2626' }}>Accès non autorisé</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFA' }}>
      <header style={{
        background: 'white', borderBottom: '1px solid #F1F5F9',
        padding: '0 24px', height: 56,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <a href="/" style={{ color: '#0F172A', textDecoration: 'none', fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>OLEL</a>
          <span style={{ color: '#CBD5E1' }}>›</span>
          <span style={{ fontSize: '0.92rem', color: '#0F172A', fontWeight: 600, letterSpacing: '-0.01em' }}>Sentinelles & Missions</span>
        </div>
        <span style={{ fontSize: '0.82rem', color: '#64748B' }}>{user.name} <span style={{ color: '#CBD5E1' }}>·</span> {user.role}</span>
      </header>

      <div style={{ maxWidth: 1200, margin: '24px auto 0', padding: '0 24px', display: 'flex', gap: 4, borderBottom: '1px solid #F1F5F9' }}>
        {([
          { key: 'sentinelles', label: 'Sentinelles' },
          { key: 'missions',    label: 'Missions terrain' },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              padding: '10px 16px', border: 'none', background: 'transparent',
              cursor: 'pointer',
              fontWeight: tab === key ? 600 : 500,
              fontSize: '0.88rem',
              color: tab === key ? '#0F172A' : '#64748B',
              borderBottom: tab === key ? '2px solid #0F172A' : '2px solid transparent',
              marginBottom: -1,
              letterSpacing: '-0.005em',
            }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement…</div>;

  const active = sentinelles.filter((s) => s.isActive);
  const inactive = sentinelles.filter((s) => !s.isActive);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24, maxWidth: 600 }}>
        <StatCard value={sentinelles.length} label="Total sentinelles" color="#0F172A" />
        <StatCard value={active.length} label="Actives" color="#16A34A" />
        <StatCard value={inactive.length} label="Inactives" color="#DC2626" />
      </div>

      <h3 style={{ fontSize: '0.9rem', color: '#0F172A', marginBottom: 12 }}>Liste des sentinelles</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ background: '#FAFAFA', color: '#64748B', fontSize: '0.78rem' }}>
            {['Nom', 'Téléphone', 'Zone', 'Statut', 'Dernière activité'].map((h) => (
              <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #E5E7EB' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sentinelles.map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
              <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0F172A' }}>{s.name}</td>
              <td style={{ padding: '10px 12px', color: '#64748B' }}>{s.phone}</td>
              <td style={{ padding: '10px 12px', color: '#64748B' }}>{s.zone?.name || '—'}</td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 5, background: s.isActive ? '#F0FDF4' : '#FEF2F2', color: s.isActive ? '#16A34A' : '#DC2626', fontSize: '0.74rem', fontWeight: 600 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.isActive ? '#16A34A' : '#DC2626' }} />
                  {s.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td style={{ padding: '10px 12px', color: '#94A3B8', fontSize: '0.78rem' }}>
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

  const STATUS_COLOR: Record<string, string> = { OPEN: '#64748B', ASSIGNED: '#2563eb', IN_PROGRESS: '#ea580c', DONE: '#16A34A', CANCELLED: '#94A3B8' };
  const STATUS_LABEL: Record<string, string> = { OPEN: 'Ouverte', ASSIGNED: 'Assignée', IN_PROGRESS: 'En cours', DONE: 'Terminée', CANCELLED: 'Annulée' };
  const TYPE_ICON: Record<string, string> = { VERIFICATION: '🔍', PATROUILLE: '🚶', SENSIBILISATION: '📣', EVACUATION: '🚨' };

  const open = missions.filter((m) => m.status === 'OPEN');
  const inProgress = missions.filter((m) => ['ASSIGNED', 'IN_PROGRESS'].includes(m.status));
  const done = missions.filter((m) => m.status === 'DONE');

  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 5, fontSize: '0.82rem', fontWeight: 600, color: '#374151' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24, maxWidth: 500 }}>
        <StatCard value={open.length} label="Ouvertes" color="#64748B" />
        <StatCard value={inProgress.length} label="En cours" color="#ea580c" />
        <StatCard value={done.length} label="Terminées" color="#16A34A" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#0F172A' }}>Toutes les missions</h3>
        <button onClick={() => setShowForm(!showForm)}
          style={{ background: showForm ? 'white' : '#0F172A', color: showForm ? '#64748B' : 'white', border: showForm ? '1px solid #E5E7EB' : 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: showForm ? 500 : 600, fontSize: '0.82rem', letterSpacing: '-0.005em' }}>
          {showForm ? 'Annuler' : '+ Nouvelle mission'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#FAFAFA', borderRadius: 10, padding: 18, marginBottom: 20, border: '1px solid #E5E7EB' }}>
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
            style={{ background: '#0F172A', color: 'white', border: 'none', padding: '10px 22px', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: saving || !form.title.trim() ? 0.5 : 1, letterSpacing: '-0.005em' }}>
            {saving ? 'Création…' : 'Créer la mission'}
          </button>
        </div>
      )}

      {loading ? <p>Chargement…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {missions.map((m) => {
            const color = STATUS_COLOR[m.status] || '#888';
            return (
              <div key={m.id} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px', borderLeft: `4px solid ${color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.92rem' }}>{TYPE_ICON[m.type] || '📋'} {m.title}</div>
                    {m.description && <div style={{ color: '#64748B', fontSize: '0.8rem', marginTop: 3 }}>{m.description}</div>}
                  </div>
                  <span style={{ padding: '2px 10px', borderRadius: 8, background: color + '22', color, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {STATUS_LABEL[m.status] || m.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem', color: '#94A3B8' }}>
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
    <div style={{ background: 'white', border: '1px solid #F1F5F9', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: 4, fontWeight: 500 }}>{label}</div>
    </div>
  );
}
