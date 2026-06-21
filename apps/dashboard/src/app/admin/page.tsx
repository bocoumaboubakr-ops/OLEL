'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

type Tab = 'users' | 'zones' | 'trainings' | 'missions' | 'audit' | 'flags' | 'rbac' | 'broadcasts';

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('users');

  if (!user) return null;
  if (!['ADMIN', 'SUPER_ADMIN', 'SUPERVISEUR_REGIONAL', 'PREFECTURE'].includes(user.role)) {
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
          <span style={{ fontSize: '0.92rem', color: '#0F172A', fontWeight: 600, letterSpacing: '-0.01em' }}>Administration</span>
        </div>
        <span style={{ fontSize: '0.82rem', color: '#64748B' }}>{user.name} <span style={{ color: '#CBD5E1' }}>·</span> {user.role}</span>
      </header>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
        {/* Nav latérale */}
        <nav style={{
          width: 220, background: 'white', borderRight: '1px solid #F1F5F9',
          padding: '20px 0', flexShrink: 0,
        }}>
          {([
            { key: 'users',      label: 'Utilisateurs' },
            { key: 'zones',      label: 'Zones' },
            { key: 'trainings',  label: 'Formations' },
            { key: 'missions',   label: 'Missions' },
            { key: 'rbac',       label: 'Permissions RBAC' },
            { key: 'broadcasts', label: 'Diffusions' },
            { key: 'audit',      label: 'Journal d\'audit' },
            { key: 'flags',      label: 'Feature flags' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                width: '100%',
                padding: '10px 20px',
                border: 'none',
                background: tab === key ? '#F1F5F9' : 'transparent',
                color: tab === key ? '#0F172A' : '#64748B',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '0.86rem',
                fontWeight: tab === key ? 600 : 500,
                letterSpacing: '-0.005em',
                borderLeft: tab === key ? '2px solid #0F172A' : '2px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <main style={{ flex: 1, padding: '24px 32px', minWidth: 0 }}>
          {tab === 'users'     && <UsersTab />}
          {tab === 'zones'     && <ZonesTab />}
          {tab === 'trainings' && <TrainingsTab />}
          {tab === 'missions'  && <MissionsTab />}
          {tab === 'rbac'      && <RbacTab />}
          {tab === 'broadcasts' && <BroadcastsTab />}
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

  const changeRole = async (id: string, role: string) => {
    await axios.patch(`${API}/users/${id}`, { role }, { headers: auth() });
    setUsers((u) => u.map((x) => (x.id === id ? { ...x, role } : x)));
  };

  const ALL_ROLES = ['CITOYEN', 'SENTINELLE', 'RADIO_COMMUNAUTAIRE', 'COORDINATEUR', 'MAIRIE', 'HYDRO_METEO', 'PREFECTURE', 'GOUVERNORAT', 'PROTECTION_CIVILE', 'SUPERVISEUR_REGIONAL', 'ADMIN', 'SUPER_ADMIN'];

  return (
    <div>
      <h2 style={h2Style}>Utilisateurs <span style={h2Count}>{users.length}</span></h2>
      {loading ? <p style={{ color: '#94A3B8', fontSize: '0.88rem' }}>Chargement…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 12, overflow: 'hidden', border: '1px solid #F1F5F9' }}>
          <thead>
            <tr style={{ background: '#FAFAFA', fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {['Nom', 'Téléphone', 'Rôle', 'Zone', 'Statut', 'Action'].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid #F1F5F9', fontSize: '0.85rem' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{u.name}</td>
                <td style={{ padding: '10px 14px', color: '#64748B' }}>{u.phone}</td>
                <td style={{ padding: '10px 14px' }}>
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u.id, e.target.value)}
                    style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: '0.75rem', color: '#0F172A', fontWeight: 600, background: '#e8f0fe', cursor: 'pointer' }}
                  >
                    {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td style={{ padding: '10px 14px', color: '#64748B' }}>{u.zoneId ? '📍' : '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 5, background: u.isActive ? '#F0FDF4' : '#FEF2F2', color: u.isActive ? '#16A34A' : '#DC2626', fontSize: '0.74rem', fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.isActive ? '#16A34A' : '#DC2626' }} />
                    {u.isActive ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button
                    onClick={() => toggleActive(u.id, u.isActive)}
                    style={{ fontSize: '0.78rem', padding: '5px 11px', borderRadius: 6, border: '1px solid #E5E7EB', cursor: 'pointer', background: 'white', color: '#64748B', fontWeight: 500 }}
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
      <h2 style={h2Style}>Zones <span style={h2Count}>{zones.length}</span></h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {zones.map((z) => (
          <div key={z.id} style={{ background: 'white', padding: '16px 18px', borderRadius: 12, border: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{z.region}</div>
            <div style={{ fontWeight: 600, fontSize: '1rem', color: '#0F172A', letterSpacing: '-0.01em', marginBottom: 10 }}>{z.name}</div>
            <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span><span style={{ color: '#0F172A', fontWeight: 600 }}>{z._count?.users ?? '—'}</span> utilisateur{(z._count?.users ?? 0) > 1 ? 's' : ''}</span>
              <span style={{ color: '#CBD5E1' }}>·</span>
              <span><span style={{ color: '#0F172A', fontWeight: 600 }}>{z._count?.alerts ?? '—'}</span> alerte{(z._count?.alerts ?? 0) > 1 ? 's' : ''}</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 8, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>{z.code}</div>
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
      <h2 style={h2Style}>Journal d&apos;audit</h2>
      <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', border: '1px solid #F1F5F9' }}>
        {logs.map((log) => (
          <div key={log.id} style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', fontSize: '0.84rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={{ color: '#0F172A' }}>
                <span style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: '0.78rem', background: '#F1F5F9', color: '#0F172A', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>{log.action}</span>
                <span style={{ marginLeft: 8, color: '#64748B' }}>{log.resource}{log.resourceId ? ` · ${log.resourceId.slice(0, 8)}` : ''}</span>
              </span>
              <span style={{ color: '#94A3B8', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{new Date(log.createdAt).toLocaleString('fr-FR')}</span>
            </div>
            {log.user && <div style={{ color: '#64748B', marginTop: 4, fontSize: '0.78rem' }}>Par {log.user.name} <span style={{ color: '#CBD5E1' }}>·</span> {log.user.phone}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FlagsTab() {
  const [flags, setFlags] = useState<{ name: string; enabled: boolean; updatedAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('olel_token')}` });

  const FLAG_META: Record<string, { label: string; description: string }> = {
    whatsapp: { label: 'WhatsApp', description: 'Notifications via WhatsApp Business API' },
    sms:      { label: 'SMS',      description: 'Notifications par SMS (Orange/Expresso Sénégal)' },
    ussd:     { label: 'USSD',     description: 'Signalement via menu USSD (sans internet)' },
    ivr:      { label: 'IVR',      description: 'Serveur vocal interactif pour alertes vocales' },
  };

  const fetchFlags = () => {
    axios.get(`${API}/flags`, { headers: auth() })
      .then(({ data }) => setFlags(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(fetchFlags, []);

  const handleToggle = async (name: string, enabled: boolean) => {
    setToggling(name);
    try {
      await axios.patch(`${API}/flags/${name}`, { enabled: !enabled }, { headers: auth() });
      setFlags((prev) => prev.map((f) => f.name === name ? { ...f, enabled: !enabled } : f));
    } catch { /* ignore */ } finally { setToggling(null); }
  };

  return (
    <div>
      <h2 style={h2Style}>Feature flags <span style={h2Sub}>Canaux de notification</span></h2>
      <p style={{ color: '#64748B', marginBottom: 20, fontSize: '0.88rem' }}>
        Activez ou désactivez les canaux de notification à chaud, sans redéploiement.
      </p>
      {loading ? <p>Chargement…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {flags.map((flag) => {
            const meta = FLAG_META[flag.name] || { label: flag.name, description: '' };
            return (
              <div key={flag.name} style={{
                background: 'white', borderRadius: 12, padding: '18px 20px',
                border: '1px solid #F1F5F9',
                opacity: toggling === flag.name ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.98rem', color: '#0F172A', letterSpacing: '-0.005em' }}>{meta.label}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: 4, lineHeight: 1.5 }}>{meta.description}</div>
                  </div>
                  <button
                    disabled={toggling === flag.name}
                    onClick={() => handleToggle(flag.name, flag.enabled)}
                    style={{
                      position: 'relative', width: 40, height: 22, borderRadius: 11, border: 'none',
                      background: flag.enabled ? '#16A34A' : '#CBD5E1', cursor: 'pointer',
                      transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 3, left: flag.enabled ? 21 : 3,
                      width: 16, height: 16, borderRadius: '50%', background: 'white',
                      transition: 'left 0.2s', display: 'block',
                    }} />
                  </button>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 600, color: flag.enabled ? '#16A34A' : '#94A3B8', background: flag.enabled ? '#F0FDF4' : '#F1F5F9', padding: '3px 9px', borderRadius: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: flag.enabled ? '#16A34A' : '#94A3B8' }} />
                  {flag.enabled ? 'Actif' : 'Désactivé'}
                  {flag.updatedAt && <span style={{ fontWeight: 400, color: '#94A3B8' }}>
                    · {new Date(flag.updatedAt).toLocaleDateString('fr-FR')}
                  </span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
        <h2 style={h2Style}>Modules de formation</h2>
        <button onClick={() => setShowForm(!showForm)}
          style={{ background: '#0F172A', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          {showForm ? '✕ Annuler' : '+ Nouveau module'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'white', borderRadius: 10, padding: 20, marginBottom: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.08)', border: '1px solid #E5E7EB' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', color: '#0F172A' }}>Nouveau module</h3>
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
            style={{ background: '#16A34A', color: 'white', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Création…' : '✅ Créer le module'}
          </button>
        </div>
      )}

      {loading ? <p>Chargement…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {modules.map((m) => (
            <div key={m.id} style={{ background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${m.isActive ? (m.isRequired ? '#DC2626' : '#2563eb') : '#d1d5db'}`, opacity: m.isActive ? 1 : 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0F172A', marginBottom: 3 }}>
                    {CAT_ICON[m.category] || '📖'} {m.title}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {m.isRequired && <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#DC2626', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>REQUIS</span>}
                    {!m.isActive && <span style={{ fontSize: '0.65rem', background: '#F1F5F9', color: '#94A3B8', padding: '1px 6px', borderRadius: 8 }}>INACTIF</span>}
                    <span style={{ fontSize: '0.65rem', background: '#f0f9ff', color: '#0369a1', padding: '1px 6px', borderRadius: 8 }}>⏱ {m.durationMin} min</span>
                  </div>
                </div>
              </div>
              <p style={{ margin: '0 0 10px', color: '#64748B', fontSize: '0.8rem', lineHeight: 1.4 }}>{m.description}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{m.lessons?.length || 0} leçon(s)</span>
                {m.isActive && (
                  <button onClick={() => handleDeactivate(m.id)}
                    style={{ fontSize: '0.75rem', padding: '4px 10px', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer', background: 'white', color: '#64748B' }}>
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
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box', fontFamily: 'inherit' };

// Styles partagés des titres de sections (cohérent dashboard minimal pro)
const h2Style: React.CSSProperties = {
  margin: '0 0 18px', fontSize: '1.2rem', fontWeight: 700,
  color: '#0F172A', letterSpacing: '-0.02em',
  display: 'flex', alignItems: 'baseline', gap: 10,
};
const h2Count: React.CSSProperties = { fontSize: '0.82rem', fontWeight: 500, color: '#94A3B8' };
const h2Sub: React.CSSProperties   = { fontSize: '0.78rem', fontWeight: 500, color: '#94A3B8', letterSpacing: 0 };

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
  const STATUS_COLOR: Record<string, string> = { OPEN: '#64748B', ASSIGNED: '#2563eb', IN_PROGRESS: '#ea580c', DONE: '#16A34A', CANCELLED: '#94A3B8' };
  const STATUS_LABEL: Record<string, string> = { OPEN: 'Ouverte', ASSIGNED: 'Assignée', IN_PROGRESS: 'En cours', DONE: 'Terminée', CANCELLED: 'Annulée' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={h2Style}>Missions terrain <span style={h2Count}>{missions.length}</span></h2>
        <button onClick={() => setShowForm(!showForm)}
          style={{ background: '#0F172A', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          {showForm ? '✕ Annuler' : '+ Nouvelle mission'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'white', borderRadius: 10, padding: 20, marginBottom: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.08)', border: '1px solid #E5E7EB' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', color: '#0F172A' }}>Nouvelle mission</h3>
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

      {loading ? <p style={{ color: '#94A3B8', fontSize: '0.88rem' }}>Chargement…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 12, overflow: 'hidden', border: '1px solid #F1F5F9' }}>
          <thead>
            <tr style={{ background: '#FAFAFA', fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {['Mission', 'Type', 'Statut', 'Assignées', 'Échéance', 'Actions'].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {missions.map((m) => (
              <tr key={m.id} style={{ borderTop: '1px solid #F1F5F9', fontSize: '0.85rem' }}>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ fontWeight: 600, color: '#0F172A' }}>{m.title}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2 }}>{m.description?.slice(0, 60)}{m.description?.length > 60 ? '…' : ''}</div>
                </td>
                <td style={{ padding: '10px 14px' }}>{TYPE_ICON[m.type] || '📋'} {m.type}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 8, background: (STATUS_COLOR[m.status] || '#888') + '22', color: STATUS_COLOR[m.status] || '#888', fontSize: '0.75rem', fontWeight: 600 }}>
                    {STATUS_LABEL[m.status] || m.status}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', color: '#64748B' }}>{m.assignments?.length || 0}</td>
                <td style={{ padding: '10px 14px', color: '#64748B', fontSize: '0.8rem' }}>
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
                          style={{ background: 'none', border: '1px solid #E5E7EB', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem' }}>
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setAssignTarget(m.id)}
                        style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 6, border: '1px solid #E5E7EB', cursor: 'pointer', background: 'white', color: '#2563eb', fontWeight: 600 }}>
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

// ── RbacTab — matrice rôle × permissions ──────────────────────────────────────
const ROLE_LABELS_RBAC: Record<string, string> = {
  CITOYEN: 'Citoyen', SENTINELLE: 'Sentinelle', RADIO_COMMUNAUTAIRE: 'Radio',
  COORDINATEUR: 'Coordinateur', MAIRIE: 'Mairie', HYDRO_METEO: 'Hydro/Météo',
  PREFECTURE: 'Préfecture', GOUVERNORAT: 'Gouvernance', PROTECTION_CIVILE: 'Protection Civile',
  SUPERVISEUR_REGIONAL: 'Superviseur', ADMIN: 'Admin', SUPER_ADMIN: 'Super Admin',
};

function RbacTab() {
  const [matrix, setMatrix] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('olel_token')}` });

  useEffect(() => {
    axios.get(`${API}/permissions/matrix`, { headers: auth() })
      .then(({ data }) => setMatrix(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#94A3B8' }}>Chargement…</div>;

  // Regrouper : permission → set de rôles
  const perms = new Map<string, { description: string; category: string; roles: Set<string> }>();
  for (const rp of matrix) {
    const name = rp.permission?.name;
    if (!name) continue;
    if (!perms.has(name)) perms.set(name, { description: rp.permission.description, category: rp.permission.category, roles: new Set() });
    perms.get(name)!.roles.add(rp.role);
  }
  const roles = Object.keys(ROLE_LABELS_RBAC);
  const rows = Array.from(perms.entries()).sort((a, b) => a[1].category.localeCompare(b[1].category) || a[0].localeCompare(b[0]));

  return (
    <div>
      <h2 style={h2Style}>Matrice des permissions <span style={h2Sub}>RBAC</span></h2>
      <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: '#94A3B8' }}>
        Source de vérité : table role_permissions. {rows.length} permissions × {roles.length} rôles.
      </p>
      <div style={{ overflowX: 'auto', background: 'white', borderRadius: 10, border: '1px solid #E5E7EB' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.72rem', minWidth: 900 }}>
          <thead>
            <tr style={{ background: '#F1F5F9' }}>
              <th style={{ ...thRbac, textAlign: 'left', position: 'sticky', left: 0, background: '#F1F5F9', minWidth: 180 }}>Permission</th>
              {roles.map((r) => (
                <th key={r} style={{ ...thRbac, writingMode: 'vertical-rl' as const, transform: 'rotate(180deg)', height: 90, whiteSpace: 'nowrap' }}>{ROLE_LABELS_RBAC[r]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, info]) => (
              <tr key={name} style={{ borderTop: '1px solid #F1F5F9' }}>
                <td style={{ padding: '5px 8px', position: 'sticky', left: 0, background: 'white', borderRight: '1px solid #E5E7EB' }}>
                  <div style={{ fontWeight: 600, color: '#374151' }}>{name}</div>
                  <div style={{ color: '#94A3B8', fontSize: '0.66rem' }}>{info.description}</div>
                </td>
                {roles.map((r) => (
                  <td key={r} style={{ textAlign: 'center', padding: '5px 4px', color: info.roles.has(r) ? '#16A34A' : '#E5E7EB', fontWeight: 700 }}>
                    {info.roles.has(r) ? '✓' : '·'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thRbac: React.CSSProperties = { padding: '6px 6px', fontSize: '0.68rem', color: '#475569', fontWeight: 700 };

// ── BroadcastsTab — historique des diffusions ─────────────────────────────────
const LEVEL_BADGE: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  BLEU: { label: 'Information', color: '#0EA5E9', bg: '#e0f2fe', icon: 'ℹ️' },
  JAUNE: { label: 'Vigilance', color: '#F59E0B', bg: '#fef9c3', icon: '⚠️' },
  ORANGE: { label: 'Pré-alerte', color: '#F97316', bg: '#ffedd5', icon: '🔶' },
  ROUGE: { label: 'Urgence', color: '#EF4444', bg: '#fee2e2', icon: '🚨' },
  ROUGE_FONCE: { label: 'Crise Majeure', color: '#7F1D1D', bg: '#fecaca', icon: '🔴' },
};

function BroadcastsTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('olel_token')}` });

  useEffect(() => {
    axios.get(`${API}/alerts/broadcasts`, { headers: auth() })
      .then(({ data }) => setItems(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#94A3B8' }}>Chargement…</div>;

  return (
    <div>
      <h2 style={h2Style}>Historique des diffusions</h2>
      {!items.length ? (
        <div style={{ color: '#94A3B8', padding: 24, textAlign: 'center' }}>Aucune diffusion enregistrée.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((b) => {
            const lvl = LEVEL_BADGE[b.alert?.alertLevel] || LEVEL_BADGE.BLEU;
            return (
              <div key={b.id} style={{ background: 'white', borderRadius: 10, border: '1px solid #E5E7EB', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem' }}>{b.alert?.title || 'Alerte'}</span>
                  <span style={{ fontSize: '0.68rem', background: lvl.bg, color: lvl.color, padding: '2px 8px', borderRadius: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>{lvl.icon} {lvl.label}</span>
                </div>
                <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: '#475569' }}>{b.message}</p>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.72rem', color: '#94A3B8' }}>
                  <span>👤 {b.author?.name || '—'}</span>
                  <span>📡 {(b.channels || []).join(', ') || '—'}</span>
                  <span>👥 {b.totalRecipients ?? 0} destinataires</span>
                  <span>✅ {b.deliveredCount ?? 0} reçus</span>
                  {b.costXof > 0 && <span>💰 {b.costXof} XOF</span>}
                  <span style={{ marginLeft: 'auto' }}>{new Date(b.createdAt).toLocaleString('fr-FR')}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
