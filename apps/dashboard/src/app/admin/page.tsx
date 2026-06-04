'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

type Tab = 'users' | 'zones' | 'trainings' | 'missions' | 'audit' | 'flags';

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
            { key: 'zones',     icon: '📍', label: 'Zones' },
            { key: 'trainings', icon: '📚', label: 'Formations' },
            { key: 'missions',  icon: '📋', label: 'Missions' },
            { key: 'audit',     icon: '🔍', label: 'Logs d\'audit' },
            { key: 'flags',     icon: '🚩', label: 'Feature Flags' },
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
          {tab === 'users'     && <UsersTab />}
          {tab === 'zones'     && <ZonesTab />}
          {tab === 'trainings' && <TrainingsTab />}
          {tab === 'missions'  && <MissionsTab />}
          {tab === 'audit'     && <AuditTab />}
          {tab === 'flags'     && <FlagsTab />}
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

// ── TrainingsTab ──────────────────────────────────────────────────────────────
function TrainingsTab() {
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('olel_token')}` });
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'SECOURISME', isRequired: false, durationMin: 30 });
  const [saving, setSaving] = useState(false);

  const fetch = () => {
    axios.get(`${API}/trainings`, { headers: auth() })
      .then(({ data }) => setModules(data || []))
      .finally(() => setLoading(false));
  };
  useEffect(fetch, []);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/trainings`, form, { headers: auth() });
      setShowForm(false);
      setForm({ title: '', description: '', category: 'SECOURISME', isRequired: false, durationMin: 30 });
      fetch();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const handleDeactivate = async (id: string) => {
    await axios.delete(`${API}/trainings/${id}`, { headers: auth() });
    fetch();
  };

  const CATEGORIES = ['SECOURISME', 'RISQUE_LOCAL', 'PROCEDURE', 'SENSIBILISATION'];
  const CAT_ICON: Record<string, string> = { SECOURISME: '🩺', RISQUE_LOCAL: '🌊', PROCEDURE: '📋', SENSIBILISATION: '📣' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: '#1a3c5e' }}>📚 Modules de formation</h2>
        <button onClick={() => setShowForm(!showForm)}
          style={{ background: '#1a3c5e', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          {showForm ? '✕ Annuler' : '+ Nouveau module'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'white', borderRadius: 10, padding: 20, marginBottom: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', color: '#1a3c5e' }}>Nouveau module</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Titre</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} placeholder="Titre du module" />
            </div>
            <div>
              <label style={labelStyle}>Catégorie</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_ICON[c]} {c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Contenu et objectifs pédagogiques" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Durée (min)</label>
              <input type="number" value={form.durationMin} min={5} max={480}
                onChange={(e) => setForm({ ...form, durationMin: +e.target.value })} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
              <input type="checkbox" id="required" checked={form.isRequired}
                onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} style={{ width: 16, height: 16 }} />
              <label htmlFor="required" style={{ fontSize: '0.88rem', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                Module requis pour certification
              </label>
            </div>
          </div>
          <button disabled={saving || !form.title.trim()} onClick={handleCreate}
            style={{ background: '#16a34a', color: 'white', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Création…' : '✅ Créer le module'}
          </button>
        </div>
      )}

      {loading ? <p>Chargement…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {modules.map((m) => (
            <div key={m.id} style={{ background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${m.isActive ? (m.isRequired ? '#dc2626' : '#2563eb') : '#d1d5db'}`, opacity: m.isActive ? 1 : 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1a3c5e', marginBottom: 3 }}>
                    {CAT_ICON[m.category] || '📖'} {m.title}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {m.isRequired && <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#dc2626', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>REQUIS</span>}
                    {!m.isActive && <span style={{ fontSize: '0.65rem', background: '#f1f5f9', color: '#94a3b8', padding: '1px 6px', borderRadius: 8 }}>INACTIF</span>}
                    <span style={{ fontSize: '0.65rem', background: '#f0f9ff', color: '#0369a1', padding: '1px 6px', borderRadius: 8 }}>⏱ {m.durationMin} min</span>
                  </div>
                </div>
              </div>
              <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '0.8rem', lineHeight: 1.4 }}>{m.description}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{m.lessons?.length || 0} leçon(s)</span>
                {m.isActive && (
                  <button onClick={() => handleDeactivate(m.id)}
                    style={{ fontSize: '0.75rem', padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', background: 'white', color: '#64748b' }}>
                    Désactiver
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 5, fontSize: '0.82rem', fontWeight: 600, color: '#374151' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box', fontFamily: 'inherit' };

// ── MissionsTab ───────────────────────────────────────────────────────────────
function MissionsTab() {
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('olel_token')}` });
  const [missions, setMissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', type: 'VERIFICATION', dueAt: '' });
  const [saving, setSaving] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [sentinelId, setSentinelId] = useState('');

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

  const handleAssign = async (missionId: string) => {
    if (!sentinelId.trim()) return;
    try {
      await axios.post(`${API}/missions/${missionId}/assign`, { sentinelId: sentinelId.trim() }, { headers: auth() });
      setSentinelId('');
      setAssignTarget(null);
      fetchMissions();
    } catch { /* ignore */ }
  };

  const MISSION_TYPES = ['VERIFICATION', 'PATROUILLE', 'SENSIBILISATION', 'EVACUATION'];
  const TYPE_ICON: Record<string, string> = { VERIFICATION: '🔍', PATROUILLE: '🚶', SENSIBILISATION: '📣', EVACUATION: '🚨' };
  const STATUS_COLOR: Record<string, string> = { OPEN: '#64748b', ASSIGNED: '#2563eb', IN_PROGRESS: '#ea580c', DONE: '#16a34a', CANCELLED: '#94a3b8' };
  const STATUS_LABEL: Record<string, string> = { OPEN: 'Ouverte', ASSIGNED: 'Assignée', IN_PROGRESS: 'En cours', DONE: 'Terminée', CANCELLED: 'Annulée' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: '#1a3c5e' }}>📋 Missions terrain ({missions.length})</h2>
        <button onClick={() => setShowForm(!showForm)}
          style={{ background: '#1a3c5e', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          {showForm ? '✕ Annuler' : '+ Nouvelle mission'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'white', borderRadius: 10, padding: 20, marginBottom: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', color: '#1a3c5e' }}>Nouvelle mission</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Titre</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} placeholder="Titre de la mission" />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle}>
                {MISSION_TYPES.map((t) => <option key={t} value={t}>{TYPE_ICON[t]} {t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Objectif et instructions terrain" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Échéance (optionnel)</label>
            <input type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} style={inputStyle} />
          </div>
          <button disabled={saving || !form.title.trim()} onClick={handleCreate}
            style={{ background: '#ea580c', color: 'white', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Création…' : '📋 Créer la mission'}
          </button>
        </div>
      )}

      {loading ? <p>Chargement…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <thead>
            <tr style={{ background: '#f8fafc', fontSize: '0.78rem', color: '#64748b' }}>
              {['Mission', 'Type', 'Statut', 'Assignées', 'Échéance', 'Actions'].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {missions.map((m) => (
              <tr key={m.id} style={{ borderTop: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ fontWeight: 600, color: '#1a3c5e' }}>{m.title}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>{m.description?.slice(0, 60)}{m.description?.length > 60 ? '…' : ''}</div>
                </td>
                <td style={{ padding: '10px 14px' }}>{TYPE_ICON[m.type] || '📋'} {m.type}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 8, background: (STATUS_COLOR[m.status] || '#888') + '22', color: STATUS_COLOR[m.status] || '#888', fontSize: '0.75rem', fontWeight: 600 }}>
                    {STATUS_LABEL[m.status] || m.status}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', color: '#64748b' }}>{m.assignments?.length || 0}</td>
                <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '0.8rem' }}>
                  {m.dueAt ? new Date(m.dueAt).toLocaleDateString('fr-FR') : '—'}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {m.status === 'OPEN' && (
                    assignTarget === m.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input value={sentinelId} onChange={(e) => setSentinelId(e.target.value)}
                          placeholder="UUID sentinelle" style={{ ...inputStyle, width: 180, padding: '4px 8px', fontSize: '0.78rem' }} />
                        <button onClick={() => handleAssign(m.id)}
                          style={{ background: '#2563eb', color: 'white', border: 'none', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                          OK
                        </button>
                        <button onClick={() => setAssignTarget(null)}
                          style={{ background: 'none', border: '1px solid #e2e8f0', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem' }}>
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setAssignTarget(m.id)}
                        style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: 'pointer', background: 'white', color: '#2563eb', fontWeight: 600 }}>
                        Assigner →
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
