'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useMobileAuth } from '@/hooks/useMobileAuth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

type Tab = 'home' | 'alerts' | 'report' | 'map' | 'profile';

const RISK_ICONS: Record<string, { icon: string; label: string; color: string }> = {
  INONDATION:           { icon: '🌊', label: 'Inondation',   color: '#3b82f6' },
  SECHERESSE:           { icon: '☀️', label: 'Sécheresse',  color: '#f59e0b' },
  INCENDIE:             { icon: '🔥', label: 'Incendie',     color: '#ef4444' },
  TEMPETE:              { icon: '🌪️', label: 'Tempête',     color: '#6366f1' },
  EPIDEMIE:             { icon: '🦠', label: 'Épidémie',     color: '#ec4899' },
  LOCUSTES:             { icon: '🦗', label: 'Criquets',     color: '#84cc16' },
  ACCIDENT_INDUSTRIEL:  { icon: '🏭', label: 'Accident',     color: '#78716c' },
  MOUVEMENT_DE_TERRAIN: { icon: '⛰️', label: 'Glissement',  color: '#92400e' },
  AUTRE:                { icon: '⚠️', label: 'Autre',        color: '#64748b' },
};
type AlertType = keyof typeof RISK_ICONS;

const SEV_ZONE = [
  { color: '#16a34a', label: 'Aucune alerte en cours',    bg: '#dcfce7', border: '#16a34a' },
  { color: '#ca8a04', label: 'Vigilance dans votre zone', bg: '#fef9c3', border: '#ca8a04' },
  { color: '#ea580c', label: 'ALERTE dans votre zone',    bg: '#ffedd5', border: '#ea580c' },
  { color: '#dc2626', label: 'URGENCE — Danger immédiat', bg: '#fee2e2', border: '#dc2626' },
];
const SEV_COLOR: Record<number, string> = { 1: '#16a34a', 2: '#ea580c', 3: '#dc2626' };
const SEV_LABEL: Record<number, string> = { 1: 'Vigilance', 2: 'Alerte', 3: 'Urgence' };
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Signalé', UNDER_REVIEW: 'En vérification', VALIDATED: 'Validé',
  BROADCAST: 'Diffusé', BROADCASTING: 'Diffusion…', ACTIVE: 'Actif',
  CLOSED: 'Clôturé', RESOLVED: 'Résolu', REJECTED: 'Rejeté',
};
const TERMINAL = ['CLOSED', 'RESOLVED', 'REJECTED', 'CANCELLED'];

interface MobileAlert { id: string; title: string; description: string; type: string; severity: number; status: string; zone?: { name: string }; createdAt: string; }

// ── App root ──────────────────────────────────────────────────────────────────
export default function MobilePage() {
  const { user, initialized, login, logout, loading: authLoading, error: authError } = useMobileAuth();
  const [tab, setTab] = useState<Tab>('home');
  const [alerts, setAlerts] = useState<MobileAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [sosOpen, setSosOpen] = useState(false);
  const [reportType, setReportType] = useState<AlertType | null>(null);
  const [reportStep, setReportStep] = useState<'type' | 'confirm' | 'done'>('type');

  const fetchAlerts = useCallback(async () => {
    try {
      const token = localStorage.getItem('olel_token');
      const { data } = await axios.get(`${API}/alerts?limit=30`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setAlerts(data.alerts || []);
    } catch { /* offline */ } finally { setAlertsLoading(false); }
  }, []);

  useEffect(() => { if (user) fetchAlerts(); }, [fetchAlerts, user]);
  useEffect(() => { if (tab === 'report') { setReportStep('type'); setReportType(null); } }, [tab]);

  if (!initialized) return <Splash />;
  if (!user) return <MobileLoginScreen onLogin={login} loading={authLoading} error={authError} />;

  const active = alerts.filter((a) => !TERMINAL.includes(a.status));
  const maxSev = active.reduce((m, a) => Math.max(m, a.severity), 0);
  const zoneStatus = SEV_ZONE[Math.min(maxSev, 3)] ?? SEV_ZONE[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f8f9fa' }}>
      {/* ── Header sticky (remplace le bouton SOS flottant) ─────────────── */}
      <header style={{
        background: '#1a3c5e', color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 52, flexShrink: 0,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>🚨 OLEL</span>
          <span style={{ fontSize: '0.68rem', opacity: 0.7 }}>Matam</span>
        </div>
        <button
          onClick={() => setSosOpen(true)}
          style={{
            background: '#dc2626', color: 'white', border: 'none',
            padding: '6px 14px', borderRadius: 20, fontWeight: 800,
            fontSize: '0.82rem', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(220,38,38,0.4)',
          }}
        >
          🆘 SOS
        </button>
      </header>

      {sosOpen && <SosModal onClose={() => setSosOpen(false)} />}

      {/* ── Contenu scrollable ───────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'home' && <HomeScreen zoneStatus={zoneStatus} activeCount={active.length} onReport={() => setTab('report')} />}
        {tab === 'alerts' && <AlertsScreen alerts={active} loading={alertsLoading} onRefresh={fetchAlerts} />}
        {tab === 'report' && (
          <ReportScreen
            step={reportStep} selectedType={reportType}
            onSelectType={(t) => { setReportType(t); setReportStep('confirm'); }}
            onSent={() => setReportStep('done')}
            onBack={() => setReportStep('type')}
            onDone={() => { fetchAlerts(); setTab('alerts'); }}
          />
        )}
        {tab === 'map' && <MapScreen alerts={active} />}
        {tab === 'profile' && <ProfileScreen user={user} onLogout={logout} />}
      </div>

      {/* ── Bottom Nav ───────────────────────────────────────────────────── */}
      <nav style={{ background: 'white', borderTop: '1px solid #e2e8f0', display: 'flex', flexShrink: 0 }}>
        {([
          { key: 'home',    icon: '🏠', label: 'Accueil' },
          { key: 'alerts',  icon: '🔔', label: active.length > 0 ? `Alertes (${active.length})` : 'Alertes' },
          { key: 'report',  icon: '📢', label: 'Signaler' },
          { key: 'map',     icon: '🗺️', label: 'Carte' },
          { key: 'profile', icon: '👤', label: 'Profil' },
        ] as { key: Tab; icon: string; label: string }[]).map(({ key, icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ flex: 1, padding: '8px 2px 6px', border: 'none', background: 'none', color: tab === key ? '#1a3c5e' : '#94a3b8', cursor: 'pointer', fontSize: '0.62rem', fontWeight: tab === key ? 700 : 400 }}>
            <div style={{ fontSize: '1.2rem', marginBottom: 1 }}>{icon}</div>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ── Splash ────────────────────────────────────────────────────────────────────
function Splash() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#1a3c5e' }}>
      <div style={{ textAlign: 'center', color: 'white' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🚨</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>OLEL</div>
        <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 6 }}>Chargement…</div>
      </div>
    </div>
  );
}

// ── MobileLoginScreen ─────────────────────────────────────────────────────────
function MobileLoginScreen({ onLogin, loading, error }: { onLogin: (p: string, pw: string) => void; loading: boolean; error: string }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#1a3c5e' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px 24px', color: 'white' }}>
        <div style={{ fontSize: '4rem', marginBottom: 8 }}>🚨</div>
        <h1 style={{ margin: '0 0 4px', fontSize: '2rem', fontWeight: 900, letterSpacing: '-1px' }}>OLEL</h1>
        <p style={{ margin: '0 0 40px', fontSize: '0.85rem', opacity: 0.8, textAlign: 'center' }}>
          Alerte précoce multi-risques<br />Région de Matam
        </p>

        <div style={{ background: 'white', borderRadius: 20, padding: '28px 24px', width: '100%', maxWidth: 360 }}>
          <h2 style={{ margin: '0 0 20px', fontSize: '1rem', color: '#1a3c5e', fontWeight: 700 }}>Connexion</h2>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>
              📱 Numéro de téléphone
            </label>
            <input
              type="tel" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+221700000001"
              style={{ width: '100%', padding: '14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '1rem', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>
              🔒 Mot de passe
            </label>
            <input
              type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onLogin(phone, password)}
              style={{ width: '100%', padding: '14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '1rem', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 12px', borderRadius: 8, marginBottom: 14, fontSize: '0.82rem' }}>{error}</div>}

          <button
            disabled={loading || !phone || !password}
            onClick={() => onLogin(phone, password)}
            style={{ width: '100%', background: '#1a3c5e', color: 'white', border: 'none', padding: '16px', borderRadius: 12, fontSize: '1rem', fontWeight: 800, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? '⏳ Connexion…' : 'Se connecter →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── HomeScreen ────────────────────────────────────────────────────────────────
function HomeScreen({ zoneStatus, activeCount, onReport }: { zoneStatus: typeof SEV_ZONE[0]; activeCount: number; onReport: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '0 0 16px' }}>
      <div style={{ background: zoneStatus.bg, borderBottom: `4px solid ${zoneStatus.border}`, padding: '16px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: zoneStatus.color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          Statut — Région Matam
        </div>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: zoneStatus.color }}>
          {zoneStatus.label}
        </div>
        {activeCount > 0 && <div style={{ fontSize: '0.78rem', color: zoneStatus.color, opacity: 0.8, marginTop: 3 }}>{activeCount} alerte(s) en cours</div>}
      </div>

      <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <button onClick={onReport}
          style={{ width: '100%', maxWidth: 340, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: 'white', border: 'none', padding: '28px 20px', borderRadius: 20, fontSize: '1.4rem', fontWeight: 900, cursor: 'pointer', boxShadow: '0 6px 24px rgba(220,38,38,0.35)', lineHeight: 1.2 }}>
          🚨 SIGNALER<br /><span style={{ fontSize: '0.88rem', fontWeight: 600, opacity: 0.9 }}>UN RISQUE</span>
        </button>

        <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0, textAlign: 'center' }}>
          Inondation · Incendie · Maladie · Sécheresse
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', maxWidth: 340 }}>
          <InfoCard icon="📊" label="Alertes actives" sub={`${activeCount} en cours`} color="#1a3c5e" />
          <InfoCard icon="🗺️" label="Carte Matam" sub="Région Matam" color="#0891b2" />
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon, label, sub, color }: { icon: string; label: string; sub: string; color: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, padding: '14px 12px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color }}>{label}</div>
      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ── ReportScreen ──────────────────────────────────────────────────────────────
function ReportScreen({ step, selectedType, onSelectType, onSent, onBack, onDone }: {
  step: 'type' | 'confirm' | 'done'; selectedType: AlertType | null;
  onSelectType: (t: AlertType) => void; onSent: () => void; onBack: () => void; onDone: () => void;
}) {
  if (step === 'done') return <ReportSuccess onDone={onDone} />;
  if (step === 'confirm' && selectedType) return <ReportConfirm type={selectedType} onSent={onSent} onBack={onBack} />;
  return <ReportTypeSelect onSelect={onSelectType} />;
}

function ReportTypeSelect({ onSelect }: { onSelect: (t: AlertType) => void }) {
  return (
    <div style={{ padding: '16px 16px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Étape 1 / 2</div>
        <h2 style={{ margin: '6px 0 0', fontSize: '1.1rem', color: '#1a3c5e' }}>Quel type de risque ?</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {(Object.entries(RISK_ICONS) as [AlertType, { icon: string; label: string; color: string }][]).map(([value, { icon, label, color }]) => (
          <button key={value} onClick={() => onSelect(value)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '18px 8px', border: `2px solid ${color}33`, borderRadius: 14, background: color + '11', cursor: 'pointer', gap: 6 }}>
            <span style={{ fontSize: '2rem' }}>{icon}</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReportConfirm({ type, onSent, onBack }: { type: AlertType; onSent: () => void; onBack: () => void }) {
  const { icon, label, color } = RISK_ICONS[type];
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    setSending(true); setError('');
    try {
      const token = localStorage.getItem('olel_token');
      if (!token) { setError('Vous devez être connecté pour signaler.'); setSending(false); return; }

      let lat: number | undefined, lng: number | undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        );
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      } catch { /* GPS non dispo */ }

      const headers = { Authorization: `Bearer ${token}` };
      // Canal canonique du signalement citoyen (cf. ARCHITECTURE_OLEL.md Workflow 1) :
      // POST /alerts crée l'alerte à l'étape SIGNALEMENT. La zone est résolue
      // côté backend (zone fournie → zone de l'utilisateur → zone par défaut Matam).
      const zoneId = process.env.NEXT_PUBLIC_DEFAULT_ZONE_ID || undefined;
      await axios.post(`${API}/alerts`, {
        title: `Signalement : ${label}`,
        description: note.trim() || `Signalement de type ${label} depuis l'application mobile.`,
        type, severity: 2, channel: 'app',
        ...(zoneId ? { zoneId } : {}),
        latitude: lat, longitude: lng,
      }, { headers });
      onSent();
    } catch (e: any) {
      const msg = e.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur lors de l\'envoi'));
    } finally { setSending(false); }
  };

  return (
    <div style={{ padding: '16px 20px 24px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0 12px', display: 'block' }}>← Retour</button>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Étape 2 / 2</div>
        <h2 style={{ margin: '6px 0 0', fontSize: '1.1rem', color: '#1a3c5e' }}>Confirmer le signalement</h2>
      </div>
      <div style={{ background: color + '11', border: `2px solid ${color}33`, borderRadius: 16, padding: '16px 20px', textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: '3rem' }}>{icon}</div>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color, marginTop: 6 }}>{label}</div>
      </div>
      <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: '0.88rem', color: '#374151' }}>
        Précisions <span style={{ fontWeight: 400, color: '#94a3b8' }}>(facultatif)</span>
      </label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Décrivez ce que vous observez..." rows={3}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.95rem', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 12 }} />
      <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: '0.78rem', color: '#0369a1' }}>
        📍 Votre position GPS sera envoyée automatiquement.
      </div>
      {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: '0.82rem' }}>{error}</div>}
      <button disabled={sending} onClick={handleSend}
        style={{ width: '100%', background: '#dc2626', color: 'white', border: 'none', padding: '16px', borderRadius: 12, fontSize: '1.05rem', fontWeight: 800, cursor: 'pointer', opacity: sending ? 0.6 : 1, boxShadow: '0 4px 16px rgba(220,38,38,0.3)' }}>
        {sending ? 'Envoi…' : '🚨 Envoyer le signalement'}
      </button>
    </div>
  );
}

function ReportSuccess({ onDone }: { onDone: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60dvh', padding: '0 24px', textAlign: 'center' }}>
      <div style={{ fontSize: '4.5rem', marginBottom: 16 }}>✅</div>
      <h2 style={{ color: '#16a34a', margin: '0 0 10px' }}>Signalement envoyé !</h2>
      <p style={{ color: '#555', margin: '0 0 28px', lineHeight: 1.7, maxWidth: 280 }}>
        Votre signalement a été transmis aux autorités.<br />Un agent va examiner votre rapport.
      </p>
      <button onClick={onDone} style={{ background: '#1a3c5e', color: 'white', border: 'none', padding: '14px 32px', borderRadius: 12, fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' }}>
        Voir les alertes →
      </button>
    </div>
  );
}

// ── AlertsScreen ──────────────────────────────────────────────────────────────
function AlertsScreen({ alerts, loading, onRefresh }: { alerts: MobileAlert[]; loading: boolean; onRefresh: () => void }) {
  if (loading) return <div style={{ textAlign: 'center', padding: 56, color: '#94a3b8', fontSize: '2.5rem' }}>⏳</div>;
  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#1a3c5e' }}>🔔 Alertes ({alerts.length})</h2>
        <button onClick={onRefresh} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 10px', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}>↻</button>
      </div>
      {!alerts.length ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
          <p style={{ margin: 0 }}>Aucune alerte active dans votre zone.</p>
        </div>
      ) : alerts.map((a) => {
        const color = SEV_COLOR[a.severity] || '#888';
        const meta = RISK_ICONS[a.type] || RISK_ICONS.AUTRE;
        return (
          <div key={a.id} style={{ background: 'white', borderRadius: 12, padding: '14px', marginBottom: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', borderLeft: `4px solid ${color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1a3c5e', flex: 1 }}>{meta.icon} {a.title}</span>
              <span style={{ fontSize: '0.68rem', background: color + '22', color, padding: '2px 7px', borderRadius: 8, whiteSpace: 'nowrap', fontWeight: 700 }}>{SEV_LABEL[a.severity]}</span>
            </div>
            <p style={{ margin: '0 0 8px', color: '#555', fontSize: '0.82rem', lineHeight: 1.4 }}>{a.description}</p>
            <div style={{ display: 'flex', gap: 10, fontSize: '0.72rem', color: '#94a3b8' }}>
              <span>📍 {a.zone?.name || 'Matam'}</span>
              <span>{STATUS_LABEL[a.status] || a.status}</span>
              <span style={{ marginLeft: 'auto' }}>{new Date(a.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── MapScreen ─────────────────────────────────────────────────────────────────
function MapScreen({ alerts }: { alerts: MobileAlert[] }) {
  return (
    <div style={{ padding: '16px' }}>
      <h2 style={{ margin: '0 0 14px', fontSize: '1.05rem', color: '#1a3c5e' }}>🗺️ Carte des risques</h2>
      <div style={{ background: '#e8f4f8', borderRadius: 12, height: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: '1px solid #bfdbfe' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🗺️</div>
        <div style={{ fontSize: '0.82rem', color: '#64748b', textAlign: 'center' }}>Carte interactive (V2)<br /><span style={{ fontSize: '0.72rem' }}>Région de Matam · Sénégal</span></div>
      </div>
      {alerts.length > 0 && <>
        <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Zones concernées</div>
        {alerts.map((a) => {
          const color = SEV_COLOR[a.severity] || '#888';
          const meta = RISK_ICONS[a.type] || RISK_ICONS.AUTRE;
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'white', borderRadius: 10, marginBottom: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <span style={{ fontSize: '1.3rem' }}>{meta.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1a3c5e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>📍 {a.zone?.name || 'Matam'}</div>
              </div>
              <span style={{ fontSize: '0.68rem', background: color + '22', color, padding: '2px 7px', borderRadius: 8, fontWeight: 700, whiteSpace: 'nowrap' }}>{SEV_LABEL[a.severity]}</span>
            </div>
          );
        })}
      </>}
    </div>
  );
}

// ── ProfileScreen ─────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  CITOYEN:          { label: 'Citoyen',          color: '#16a34a' },
  SENTINELLE:       { label: 'Sentinelle',        color: '#0891b2' },
  MAIRIE:           { label: 'Agent Mairie',      color: '#7c3aed' },
  PREFECTURE:       { label: 'Agent Préfecture',  color: '#ea580c' },
  GOUVERNORAT:      { label: 'Gouvernorat',       color: '#dc2626' },
  PROTECTION_CIVILE:{ label: 'Protection Civile', color: '#dc2626' },
  ADMIN:            { label: 'Administrateur',    color: '#1a3c5e' },
  SUPER_ADMIN:      { label: 'Super Admin',       color: '#1a3c5e' },
};

function ProfileScreen({ user, onLogout }: { user: { id: string; name: string; phone: string; role: string }; onLogout: () => void }) {
  const roleInfo = ROLE_LABEL[user.role] || { label: user.role, color: '#64748b' };
  return (
    <div style={{ padding: '20px 16px' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: '1.05rem', color: '#1a3c5e' }}>👤 Mon profil</h2>

      <div style={{ background: 'white', borderRadius: 16, padding: '20px', marginBottom: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: roleInfo.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', flexShrink: 0 }}>
            {user.role === 'CITOYEN' ? '👤' : user.role === 'SENTINELLE' ? '🔭' : user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? '⚙️' : '🏛️'}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1a3c5e' }}>{user.name}</div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>{user.phone}</div>
          </div>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', background: roleInfo.color + '11', border: `1.5px solid ${roleInfo.color}33`, borderRadius: 20, padding: '4px 12px', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: roleInfo.color }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: roleInfo.color }}>{roleInfo.label}</span>
        </div>
      </div>

      <div style={{ background: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
        <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Plateforme</div>
        {[
          { icon: '🌍', label: 'Zone', value: 'Région de Matam' },
          { icon: '📡', label: 'Version', value: 'OLEL MVP v1.0' },
          { icon: '🔒', label: 'Session', value: 'Sécurisée (JWT)' },
        ].map(({ icon, label, value }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>{icon} {label}</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>{value}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onLogout}
        style={{ width: '100%', background: '#fee2e2', color: '#dc2626', border: '1.5px solid #fecaca', padding: '14px', borderRadius: 12, fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' }}
      >
        🚪 Se déconnecter
      </button>

      <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.68rem', color: '#cbd5e1' }}>OLEL · Alerte Précoce · Matam, Sénégal</p>
    </div>
  );
}

// ── SosModal ──────────────────────────────────────────────────────────────────
function SosModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9998, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ background: 'white', width: '100%', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px', maxWidth: 480, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ margin: 0, color: '#dc2626', fontSize: '1.1rem' }}>🆘 Numéros d&apos;urgence</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Pompiers',          number: '18',   color: '#dc2626' },
            { label: 'Police',            number: '17',   color: '#1d4ed8' },
            { label: 'SAMU',              number: '15',   color: '#16a34a' },
            { label: 'Protection Civile', number: '1515', color: '#ea580c' },
          ].map(({ label, number, color }) => (
            <a key={number} href={`tel:${number}`}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: color + '11', borderRadius: 12, border: `2px solid ${color}33`, textDecoration: 'none' }}>
              <span style={{ fontWeight: 700, color: '#1a3c5e', fontSize: '0.92rem' }}>{label}</span>
              <span style={{ fontWeight: 900, fontSize: '1.4rem', color }}>{number}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
