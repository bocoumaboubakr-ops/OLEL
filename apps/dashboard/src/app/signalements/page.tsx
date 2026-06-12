'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface Signalement {
  id: string;
  type: string;
  text: string;
  severity?: number | null;
  status: string;
  channel: string;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
  mediaUrls: string[];
  user?: { id: string; name: string; phone: string; zone?: { name: string } | null };
}

const TYPE_LABEL: Record<string, string> = {
  INONDATION: '🌊 Inondation',
  SECHERESSE: '☀️ Sécheresse',
  INCENDIE: '🔥 Incendie',
  TEMPETE: '🌪️ Tempête',
  EPIDEMIE: '🦠 Épidémie',
  LOCUSTES: '🦗 Criquets',
  MOUVEMENT_DE_TERRAIN: '⛰️ Mouvement de terrain',
  AUTRE: '⚠️ Autre',
};

const SEVERITY_LABEL: Record<number, { txt: string; color: string }> = {
  1: { txt: '🟢 Vigilance', color: '#16a34a' },
  2: { txt: '🟡 Alerte', color: '#eab308' },
  3: { txt: '🔴 Urgence', color: '#dc2626' },
};

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: '💬 WhatsApp',
  web: '🌐 Web',
  ussd: '☎️ USSD',
  ivr: '📞 IVR',
  app: '📱 App',
};

const STATUS_OPTIONS = ['PENDING', 'VALIDATED', 'REJECTED'];

export default function SignalementsPage() {
  const { user, initialized, logout } = useAuth();
  const [items, setItems] = useState<Signalement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    if (initialized && !user) window.location.href = '/login';
  }, [initialized, user]);

  const fetchItems = async () => {
    const token = localStorage.getItem('olel_token');
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ limit: '50', ...(statusFilter ? { status: statusFilter } : {}) });
      const { data } = await axios.get(`${API}/signalements?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(data.items || []);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) fetchItems(); /* eslint-disable-next-line */ }, [user, statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    const canAct = ['MAIRIE', 'PREFECTURE', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
    if (!canAct) return;
    const token = localStorage.getItem('olel_token');
    setActing(id);
    try {
      await axios.patch(`${API}/signalements/${id}/status`, { status }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchItems();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur');
    } finally {
      setActing(null);
    }
  };

  if (!initialized || !user) return null;
  const canAct = ['MAIRIE', 'PREFECTURE', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header style={{ background: '#1a3c5e', color: 'white', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <a href="/" style={{ color: 'white', textDecoration: 'none', fontWeight: 700 }}>🚨 OLEL</a>
          <span style={{ opacity: 0.6 }}>›</span>
          <strong>📋 Signalements citoyens</strong>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem' }}>{user.name} · {user.role}</span>
          <button onClick={logout} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>Déconnexion</button>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '20px auto', padding: '0 20px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <label style={{ fontSize: '0.9rem', color: '#475569' }}>Filtre statut :</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.9rem' }}>
            <option value="">Tous</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={fetchItems} style={{ background: '#1a3c5e', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
            🔄 Rafraîchir
          </button>
          <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#64748b' }}>{items.length} signalement(s)</span>
        </div>

        {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 12 }}>{error}</div>}
        {loading && <p style={{ color: '#64748b' }}>Chargement…</p>}

        {!loading && items.length === 0 && (
          <div style={{ background: 'white', padding: 40, textAlign: 'center', borderRadius: 12, color: '#64748b' }}>
            Aucun signalement dans votre zone pour le moment.
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((s) => {
            const sev = s.severity ? SEVERITY_LABEL[s.severity] : null;
            return (
              <div key={s.id} style={{ background: 'white', borderRadius: 12, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: `4px solid ${sev?.color || '#94a3b8'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: '1rem', color: '#1a3c5e' }}>{TYPE_LABEL[s.type] || s.type}</strong>
                    {sev && <span style={{ marginLeft: 10, color: sev.color, fontSize: '0.85rem', fontWeight: 600 }}>{sev.txt}</span>}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                    {CHANNEL_LABEL[s.channel] || s.channel} · {new Date(s.createdAt).toLocaleString('fr-FR')}
                  </div>
                </div>

                <p style={{ margin: '4px 0 10px', color: '#334155', fontSize: '0.92rem', lineHeight: 1.5 }}>{s.text}</p>

                <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {s.user && <span>👤 {s.user.name} ({s.user.phone})</span>}
                  {s.user?.zone?.name && <span>📍 Zone : {s.user.zone.name}</span>}
                  {(s.latitude && s.longitude) && <span>🛰️ GPS : {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}</span>}
                  <span style={{ marginLeft: 'auto', background: s.status === 'PENDING' ? '#fef3c7' : s.status === 'VALIDATED' ? '#dcfce7' : s.status === 'REJECTED' ? '#fee2e2' : '#dbeafe', color: '#334155', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    {s.status}
                  </span>
                </div>

                {canAct && s.status === 'PENDING' && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                    <button onClick={() => updateStatus(s.id, 'VALIDATED')} disabled={acting === s.id}
                      style={{ background: '#16a34a', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                      ✅ Valider
                    </button>
                    <button onClick={() => updateStatus(s.id, 'REJECTED')} disabled={acting === s.id}
                      style={{ background: '#dc2626', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                      ❌ Rejeter
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
