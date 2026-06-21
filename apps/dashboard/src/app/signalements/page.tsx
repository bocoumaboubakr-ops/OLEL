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
  fieldVerifiedAt?: string | null;
  fieldVerifiedBy?: { id: string; name: string; phone: string } | null;
  fieldNotes?: string | null;
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
  1: { txt: '🟢 Vigilance', color: '#16A34A' },
  2: { txt: '🟡 Alerte', color: '#eab308' },
  3: { txt: '🔴 Urgence', color: '#DC2626' },
};

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: '💬 WhatsApp',
  web: '🌐 Web',
  ussd: '☎️ USSD',
  ivr: '📞 IVR',
  app: '📱 App',
};

const STATUS_OPTIONS = ['PENDING', 'VALIDATED', 'REJECTED'];

/** Détermine si une URL de média est un fichier audio (vocal). */
function isAudioUrl(url: string): boolean {
  return /\.(ogg|mp3|m4a|aac|webm|amr|3gp)(\?|$)/i.test(url);
}

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

  // En HTTP (pas de contexte sécurisé), les navigateurs bloquent la géolocalisation :
  // on bascule alors sur une saisie manuelle des coordonnées.
  const askManualCoords = (): { latitude: number; longitude: number } | null => {
    const input = prompt(
      'GPS indisponible sur cette connexion (HTTP).\nSaisissez les coordonnées manuellement :\nFormat : latitude, longitude — ex. 15.6556, -13.2553',
    );
    if (!input) return null;
    const parts = input.split(',').map((x) => parseFloat(x.trim()));
    if (parts.length !== 2 || parts.some(Number.isNaN)) {
      alert('Format invalide. Exemple attendu : 15.6556, -13.2553');
      return null;
    }
    return { latitude: parts[0], longitude: parts[1] };
  };

  const fieldVerify = async (id: string) => {
    const notes = prompt('Notes terrain (ampleur, victimes, accès) — optionnel :') || undefined;
    const token = localStorage.getItem('olel_token');

    const submit = async (coords: { latitude: number; longitude: number }) => {
      try {
        await axios.patch(`${API}/signalements/${id}/field-verify`, { ...coords, notes }, {
          headers: { Authorization: `Bearer ${token}` },
        });
        await fetchItems();
      } catch (e: any) {
        alert(e.response?.data?.message || 'Erreur vérification');
      } finally {
        setActing(null);
      }
    };

    setActing(id);
    if (navigator.geolocation && window.isSecureContext) {
      navigator.geolocation.getCurrentPosition(
        (pos) => submit({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => {
          const c = askManualCoords();
          if (c) submit(c); else setActing(null);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    } else {
      const c = askManualCoords();
      if (c) submit(c); else setActing(null);
    }
  };

  if (!initialized || !user) return null;
  const canValidate = ['MAIRIE', 'PREFECTURE', 'ADMIN', 'SUPER_ADMIN', 'GOUVERNORAT', 'PROTECTION_CIVILE', 'SUPERVISEUR_REGIONAL'].includes(user.role);
  const canFieldVerify = ['SENTINELLE', 'COORDINATEUR'].includes(user.role) || canValidate;

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
          <span style={{ fontSize: '0.92rem', color: '#0F172A', fontWeight: 600, letterSpacing: '-0.01em' }}>Signalements citoyens</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', color: '#64748B' }}>{user.name} <span style={{ color: '#CBD5E1' }}>·</span> {user.role}</span>
          <button onClick={logout} style={{ background: 'white', color: '#64748B', border: '1px solid #E5E7EB', padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500 }}>Déconnexion</button>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '24px auto', padding: '0 20px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18 }}>
          <label style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>Statut :</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.85rem', background: 'white', color: '#0F172A', fontFamily: 'inherit' }}>
            <option value="">Tous</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={fetchItems} style={{ background: 'white', color: '#64748B', border: '1px solid #E5E7EB', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500 }}>
            Actualiser
          </button>
          <span style={{ marginLeft: 'auto', fontSize: '0.82rem', color: '#94A3B8', fontWeight: 500 }}>{items.length} signalement{items.length > 1 ? 's' : ''}</span>
        </div>

        {error && <div style={{ background: '#fee2e2', color: '#DC2626', padding: 12, borderRadius: 8, marginBottom: 12 }}>{error}</div>}
        {loading && <p style={{ color: '#64748B' }}>Chargement…</p>}

        {!loading && items.length === 0 && (
          <div style={{ background: 'white', padding: 40, textAlign: 'center', borderRadius: 12, color: '#64748B' }}>
            Aucun signalement dans votre zone pour le moment.
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((s) => {
            const sev = s.severity ? SEVERITY_LABEL[s.severity] : null;
            return (
              <div key={s.id} style={{ background: 'white', borderRadius: 12, padding: '18px 20px', border: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {sev && <span style={{ width: 8, height: 8, borderRadius: '50%', background: sev.color, flexShrink: 0 }} />}
                    <strong style={{ fontSize: '0.95rem', color: '#0F172A', letterSpacing: '-0.01em', fontWeight: 600 }}>{TYPE_LABEL[s.type] || s.type}</strong>
                    {sev && <span style={{ color: sev.color, fontSize: '0.78rem', fontWeight: 600, background: sev.color + '14', padding: '2px 8px', borderRadius: 5 }}>{sev.txt.replace(/^[🟢🟡🔴]\s*/, '')}</span>}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#94A3B8', fontWeight: 500 }}>
                    {CHANNEL_LABEL[s.channel] || s.channel} <span style={{ color: '#CBD5E1' }}>·</span> {new Date(s.createdAt).toLocaleString('fr-FR')}
                  </div>
                </div>

                <p style={{ margin: '4px 0 10px', color: '#334155', fontSize: '0.92rem', lineHeight: 1.5 }}>{s.text}</p>

                {/* Médias : photos affichées, vocaux écoutables par l'opérateur */}
                {s.mediaUrls?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '0 0 10px' }}>
                    {s.mediaUrls.map((url, i) => (
                      isAudioUrl(url) ? (
                        <div key={i} style={{ background: '#F1F5F9', borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ fontSize: '0.74rem', color: '#475569', marginBottom: 4, fontWeight: 600 }}>🎙️ Message vocal — écoutez et qualifiez</div>
                          <audio controls preload="none" src={url} style={{ width: '100%', height: 36 }} />
                        </div>
                      ) : (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt="preuve" style={{ maxWidth: 160, maxHeight: 160, borderRadius: 8, border: '1px solid #E5E7EB', objectFit: 'cover' }} />
                        </a>
                      )
                    ))}
                  </div>
                )}

                <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {s.user && <span>👤 {s.user.name} ({s.user.phone})</span>}
                  {s.user?.zone?.name && <span>📍 Zone : {s.user.zone.name}</span>}
                  {(s.latitude && s.longitude) && <span>🛰️ GPS : {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}</span>}
                  <span style={{ marginLeft: 'auto', background: s.status === 'PENDING' ? '#fef3c7' : s.status === 'VALIDATED' ? '#dcfce7' : s.status === 'REJECTED' ? '#fee2e2' : '#dbeafe', color: '#334155', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    {s.status}
                  </span>
                </div>

                {(() => {
                  const needsField = !s.fieldVerifiedAt && !(s.latitude && s.longitude) && (s.mediaUrls?.length ?? 0) === 0;
                  return (
                    <>
                      {s.fieldVerifiedAt && (
                        <div style={{ marginTop: 10, padding: '8px 12px', background: '#dcfce7', color: '#166534', borderRadius: 6, fontSize: '0.82rem' }}>
                          ✔️ Vérifié sur place par <strong>{s.fieldVerifiedBy?.name || 'sentinelle'}</strong> le {new Date(s.fieldVerifiedAt).toLocaleString('fr-FR')}
                          {s.fieldNotes && <div style={{ marginTop: 4, fontStyle: 'italic' }}>« {s.fieldNotes} »</div>}
                        </div>
                      )}
                      {needsField && s.status === 'PENDING' && (
                        <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef3c7', color: '#92400e', borderRadius: 6, fontSize: '0.82rem' }}>
                          ⚠️ Aucun GPS ni photo — vérification terrain par une sentinelle requise avant validation
                        </div>
                      )}
                      {s.status === 'PENDING' && (
                        <div style={{ marginTop: 12, display: 'flex', gap: 8, borderTop: '1px solid #F1F5F9', paddingTop: 12, flexWrap: 'wrap' }}>
                          {canFieldVerify && !s.fieldVerifiedAt && (
                            <button onClick={() => fieldVerify(s.id)} disabled={acting === s.id}
                              style={{ background: 'white', color: '#0F172A', border: '1px solid #E5E7EB', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500 }}>
                              Vérifier sur place
                            </button>
                          )}
                          {canValidate && (
                            <button onClick={() => updateStatus(s.id, 'VALIDATED')}
                              disabled={acting === s.id || (user.role === 'MAIRIE' && needsField)}
                              title={user.role === 'MAIRIE' && needsField ? 'Vérification sentinelle requise' : ''}
                              style={{ background: user.role === 'MAIRIE' && needsField ? '#E5E7EB' : '#0F172A', color: user.role === 'MAIRIE' && needsField ? '#94A3B8' : 'white', border: 'none', padding: '7px 14px', borderRadius: 8, cursor: user.role === 'MAIRIE' && needsField ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                              Valider
                            </button>
                          )}
                          {canValidate && (
                            <button onClick={() => updateStatus(s.id, 'REJECTED')} disabled={acting === s.id}
                              style={{ background: 'white', color: '#DC2626', border: '1px solid #FECACA', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500 }}>
                              Rejeter
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
