'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useMobileAuth } from '@/hooks/useMobileAuth';
import { useOfflineQueue, queueSignalement } from '@/hooks/useOfflineQueue';
import { useI18n, LANGS } from '@/lib/i18n';
import { MediaCapture, type CapturedMedia } from '@/lib/MediaCapture';
import { THEMES, type Theme, type RiskOption, type AlertTypeValue } from '@/lib/themes';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// Sélecteur de langue réutilisable (persiste localStorage + propage backend)
function LanguageSelector({ compact }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      {LANGS.map((l) => (
        <button key={l.code} onClick={() => setLang(l.code)}
          style={{
            padding: compact ? '6px 12px' : '8px 14px',
            border: `1px solid ${lang === l.code ? 'transparent' : '#E5E7EB'}`,
            background: lang === l.code ? '#0F172A' : compact ? 'rgba(255,255,255,0.08)' : 'white',
            color: lang === l.code ? 'white' : compact ? 'white' : '#475569',
            borderRadius: 8, fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
            letterSpacing: '-0.005em',
          }}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

type Tab = 'home' | 'alerts' | 'report' | 'map' | 'formations' | 'missions' | 'validate' | 'profile';
const SENTINEL_ROLES = ['SENTINELLE', 'COORDINATEUR', 'MAIRIE', 'PREFECTURE', 'GOUVERNORAT', 'PROTECTION_CIVILE', 'SUPERVISEUR_REGIONAL', 'ADMIN', 'SUPER_ADMIN'];

const RISK_ICONS: Record<string, { icon: string; label: string; color: string }> = {
  INONDATION:           { icon: '🌊', label: 'Inondation',   color: '#3b82f6' },
  SECHERESSE:           { icon: '☀️', label: 'Sécheresse',  color: '#f59e0b' },
  INCENDIE:             { icon: '🔥', label: 'Incendie',     color: '#ef4444' },
  TEMPETE:              { icon: '🌪️', label: 'Tempête',     color: '#6366f1' },
  EPIDEMIE:             { icon: '🦠', label: 'Épidémie',     color: '#ec4899' },
  LOCUSTES:             { icon: '🦗', label: 'Criquets',     color: '#84cc16' },
  ACCIDENT_INDUSTRIEL:  { icon: '🏭', label: 'Accident',     color: '#78716c' },
  MOUVEMENT_DE_TERRAIN: { icon: '⛰️', label: 'Glissement',  color: '#92400e' },
  AUTRE:                { icon: '⚠️', label: 'Autre',        color: '#64748B' },
};

const SEV_ZONE = [
  { color: '#16A34A', label: 'Aucune alerte en cours',    bg: '#dcfce7', border: '#16A34A' },
  { color: '#ca8a04', label: 'Vigilance dans votre zone', bg: '#fef9c3', border: '#ca8a04' },
  { color: '#ea580c', label: 'ALERTE dans votre zone',    bg: '#ffedd5', border: '#ea580c' },
  { color: '#DC2626', label: 'URGENCE — Danger immédiat', bg: '#fee2e2', border: '#DC2626' },
];
const SEV_COLOR: Record<number, string> = { 1: '#16A34A', 2: '#ea580c', 3: '#DC2626' };
const SEV_LABEL: Record<number, string> = { 1: 'Vigilance', 2: 'Alerte', 3: 'Urgence' };
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Signalé', UNDER_REVIEW: 'En vérification', VALIDATED: 'Validé',
  BROADCAST: 'Diffusé', BROADCASTING: 'Diffusion…', ACTIVE: 'Actif',
  CLOSED: 'Clôturé', RESOLVED: 'Résolu', REJECTED: 'Rejeté',
};
const TERMINAL = ['CLOSED', 'RESOLVED', 'REJECTED', 'CANCELLED'];

// Niveaux d'alerte officiels (miroir backend alert-workflow.ts)
type AlertLevel = 'BLEU' | 'JAUNE' | 'ORANGE' | 'ROUGE' | 'ROUGE_FONCE';
const LEVEL_CONFIG: Record<AlertLevel, { label: string; color: string; bg: string; icon: string }> = {
  BLEU:        { label: 'Information',   color: '#0EA5E9', bg: '#e0f2fe', icon: 'ℹ️' },
  JAUNE:       { label: 'Vigilance',     color: '#F59E0B', bg: '#fef9c3', icon: '⚠️' },
  ORANGE:      { label: 'Pré-alerte',    color: '#F97316', bg: '#ffedd5', icon: '🔶' },
  ROUGE:       { label: 'Urgence',       color: '#EF4444', bg: '#fee2e2', icon: '🚨' },
  ROUGE_FONCE: { label: 'Crise Majeure', color: '#7F1D1D', bg: '#fecaca', icon: '🔴' },
};

function LevelBadge({ level }: { level?: string }) {
  const cfg = LEVEL_CONFIG[(level as AlertLevel)] || LEVEL_CONFIG.BLEU;
  return (
    <span style={{ fontSize: '0.68rem', background: cfg.bg, color: cfg.color, padding: '3px 8px', borderRadius: 6, fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.01em' }}>
      {cfg.label}
    </span>
  );
}

interface MobileAlert { id: string; title: string; description: string; type: string; severity: number; alertLevel?: string; status: string; zone?: { name: string }; createdAt: string; }

interface MobileSignalement {
  id: string; type: string; text: string; severity?: number | null;
  status: string; channel: string; latitude?: number | null; longitude?: number | null;
  mediaUrls?: string[];
  fieldVerifiedAt?: string | null; fieldNotes?: string | null; createdAt: string;
  user?: { name: string; phone: string; zone?: { name: string } | null };
}

/** Détermine si une URL de média est un fichier audio (vocal). */
function isAudioUrl(url: string): boolean {
  return /\.(ogg|mp3|m4a|aac|webm|amr|3gp)(\?|$)/i.test(url);
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function MobilePage() {
  const { user, initialized, login, logout, requestOtp, verifyOtp, loading: authLoading, error: authError } = useMobileAuth();
  const [tab, setTab] = useState<Tab>('home');
  const [alerts, setAlerts] = useState<MobileAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [sosOpen, setSosOpen] = useState(false);
  const [reportTheme, setReportTheme] = useState<Theme | null>(null);
  const [reportOption, setReportOption] = useState<RiskOption | null>(null);
  const [reportStep, setReportStep] = useState<'theme' | 'option' | 'confirm' | 'done'>('theme');
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useOfflineQueue();

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const token = localStorage.getItem('olel_token');
      const { data } = await axios.get(`${API}/alerts?limit=30`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setAlerts(data.alerts || []);
    } catch { /* offline */ } finally { setAlertsLoading(false); }
  }, []);

  const [signalements, setSignalements] = useState<MobileSignalement[]>([]);
  const fetchSignalements = useCallback(async () => {
    try {
      const token = localStorage.getItem('olel_token');
      if (!token) return;
      const { data } = await axios.get(`${API}/signalements?status=PENDING&limit=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSignalements(data.items || []);
    } catch { /* rôle sans accès ou offline */ }
  }, []);

  useEffect(() => { if (user) fetchAlerts(); }, [fetchAlerts, user]);
  useEffect(() => {
    if (user && SENTINEL_ROLES.includes(user.role)) fetchSignalements();
  }, [fetchSignalements, user]);
  useEffect(() => { if (tab === 'report') { setReportStep('theme'); setReportTheme(null); setReportOption(null); } }, [tab]);

  if (!initialized) return <Splash />;
  if (!user) return (
    <MobileLoginScreen
      onLogin={login}
      onRequestOtp={requestOtp}
      onVerifyOtp={verifyOtp}
      loading={authLoading}
      error={authError}
    />
  );

  const active = alerts.filter((a) => !TERMINAL.includes(a.status));
  const maxSev = active.reduce((m, a) => Math.max(m, a.severity), 0);
  const zoneStatus = SEV_ZONE[Math.min(maxSev, 3)] ?? SEV_ZONE[0];
  const isSentinel = user && SENTINEL_ROLES.includes(user.role);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f8f9fa' }}>
      {/* ── Header sticky ───────────────────────────────────────────────── */}
      <header style={{
        background: 'white', color: '#0F172A',
        borderBottom: '1px solid #F1F5F9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 56, flexShrink: 0,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.02em' }}>OLEL</span>
          <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 500 }}>Matam</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isOnline && (
            <span style={{ fontSize: '0.68rem', background: '#FEF3C7', color: '#92400E', padding: '3px 9px', borderRadius: 6, fontWeight: 600 }}>
              Hors ligne
            </span>
          )}
          <button
            onClick={() => setSosOpen(true)}
            style={{
              background: '#DC2626', color: 'white', border: 'none',
              padding: '7px 14px', borderRadius: 8, fontWeight: 600,
              fontSize: '0.82rem', cursor: 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            SOS
          </button>
        </div>
      </header>

      {sosOpen && <SosModal onClose={() => setSosOpen(false)} />}

      {/* ── Contenu scrollable ───────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'home' && <HomeScreen zoneStatus={zoneStatus} activeCount={active.length} onReport={() => setTab('report')} onAlerts={() => setTab('alerts')} onMap={() => setTab('map')} isSentinel={isSentinel} />}
        {tab === 'alerts' && <AlertsScreen alerts={active} loading={alertsLoading} onRefresh={fetchAlerts} />}
        {tab === 'report' && (
          <ReportScreen
            step={reportStep}
            selectedTheme={reportTheme}
            selectedOption={reportOption}
            onSelectTheme={(theme) => { setReportTheme(theme); setReportStep('option'); }}
            onSelectOption={(option) => { setReportOption(option); setReportStep('confirm'); }}
            onSent={() => setReportStep('done')}
            onBackToTheme={() => { setReportTheme(null); setReportOption(null); setReportStep('theme'); }}
            onBackToOption={() => { setReportOption(null); setReportStep('option'); }}
            onDone={() => { fetchAlerts(); setTab('alerts'); }}
          />
        )}
        {tab === 'map' && <MapScreen alerts={active} />}
        {tab === 'formations' && <FormationsScreen />}
        {tab === 'missions' && <MissionsScreen />}
        {tab === 'validate' && <SentinelValidationScreen alerts={alerts.filter((a) => a.status === 'PENDING' || a.status === 'UNDER_REVIEW')} signalements={signalements} onDone={() => { fetchAlerts(); fetchSignalements(); }} />}
        {tab === 'profile' && <ProfileScreen user={user} onLogout={logout} />}
      </div>

      {/* ── Bottom Nav ───────────────────────────────────────────────────── */}
      <nav style={{ background: 'white', borderTop: '1px solid #F1F5F9', display: 'flex', flexShrink: 0, overflowX: 'auto', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {([
          { key: 'home',       icon: '◉', label: 'Accueil' },
          { key: 'alerts',     icon: '●', label: 'Alertes', badge: active.length > 0 ? active.length : undefined },
          { key: 'report',     icon: '＋', label: 'Signaler' },
          ...(isSentinel ? [
            { key: 'validate',   icon: '✓',  label: 'Valider' },
            { key: 'missions',   icon: '☰',  label: 'Missions' },
            { key: 'formations', icon: '⚐',  label: 'Formation' },
          ] : [
            { key: 'map',        icon: '◐',  label: 'Carte' },
          ]),
          { key: 'profile',    icon: '○', label: 'Profil' },
        ] as { key: Tab; icon: string; label: string; badge?: number }[]).map(({ key, icon, label, badge }) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              flex: 1, padding: '10px 2px 8px', border: 'none', background: 'none',
              color: tab === key ? '#0F172A' : '#94A3B8', cursor: 'pointer',
              fontSize: '0.66rem', fontWeight: tab === key ? 600 : 400,
              position: 'relative',
            }}>
            <div style={{ fontSize: '1.05rem', marginBottom: 3, lineHeight: 1 }}>{icon}</div>
            {label}
            {badge !== undefined && (
              <span style={{
                position: 'absolute', top: 5, right: '50%', marginRight: -16,
                background: '#DC2626', color: 'white', fontSize: '0.6rem',
                fontWeight: 600, padding: '1px 5px', borderRadius: 8, minWidth: 16, textAlign: 'center',
              }}>{badge}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ── Splash ────────────────────────────────────────────────────────────────────
function Splash() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#0F172A' }}>
      <div style={{ textAlign: 'center', color: 'white' }}>
        <div style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.02em' }}>OLEL</div>
        <div style={{ fontSize: '0.78rem', opacity: 0.5, marginTop: 8, letterSpacing: '0.05em' }}>Chargement…</div>
      </div>
    </div>
  );
}

// ── MobileLoginScreen ─────────────────────────────────────────────────────────
function MobileLoginScreen({
  onLogin, onRequestOtp, onVerifyOtp, loading, error,
}: {
  onLogin: (p: string, pw: string) => void;
  onRequestOtp: (p: string) => Promise<{ dev_code?: string } | null>;
  onVerifyOtp: (p: string, code: string) => void;
  loading: boolean;
  error: string;
}) {
  const [mode, setMode] = useState<'choose' | 'otp_phone' | 'otp_code' | 'password'>('choose');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [devCode, setDevCode] = useState('');

  const handleRequestOtp = async () => {
    const result = await onRequestOtp(phone);
    if (result) {
      if (result.dev_code) setDevCode(result.dev_code);
      setMode('otp_code');
    }
  };

  const inpStyle = { width: '100%', padding: '12px 14px', border: '1px solid #E5E7EB', borderRadius: 10, fontSize: '0.95rem', boxSizing: 'border-box' as const, outline: 'none', fontFamily: 'inherit' };
  const btnPrimary = (disabled?: boolean): React.CSSProperties => ({ width: '100%', background: '#0F172A', color: 'white', border: 'none', padding: '14px', borderRadius: 10, fontSize: '0.95rem', fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, letterSpacing: '-0.01em' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#0F172A' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', color: 'white' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: '2.2rem', fontWeight: 700, letterSpacing: '-0.04em' }}>OLEL</h1>
        <p style={{ margin: '0 0 24px', fontSize: '0.85rem', color: '#94A3B8', textAlign: 'center' }}>
          Alerte précoce · Matam
        </p>
        <div style={{ marginBottom: 24 }}>
          <LanguageSelector compact />
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: '24px 22px', width: '100%', maxWidth: 360 }}>

          {/* ── Choix du mode ── */}
          {mode === 'choose' && (
            <>
              <h2 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#0F172A', fontWeight: 600, letterSpacing: '-0.01em' }}>Comment souhaitez-vous accéder ?</h2>
              <button onClick={() => setMode('otp_phone')} style={{ ...btnPrimary(), marginBottom: 10, background: '#DC2626' }}>
                Citoyen — code SMS
              </button>
              <button onClick={() => setMode('password')} style={{ ...btnPrimary(), background: 'white', color: '#0F172A', border: '1px solid #E5E7EB' }}>
                Opérateur — mot de passe
              </button>
              <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94A3B8', marginTop: 14, marginBottom: 0, lineHeight: 1.5 }}>
                Citoyens : code SMS.<br />Sentinelles et agents : mot de passe.
              </p>
            </>
          )}

          {/* ── OTP : saisie du téléphone ── */}
          {mode === 'otp_phone' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <button onClick={() => setMode('choose')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.1rem' }}>←</button>
                <h2 style={{ margin: 0, fontSize: '1rem', color: '#0F172A', fontWeight: 700 }}>Connexion citoyen</h2>
              </div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>📱 Numéro de téléphone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+221700000001" style={{ ...inpStyle, marginBottom: 16 }} />
              {error && <div style={{ background: '#fee2e2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: '0.82rem' }}>{error}</div>}
              <button disabled={loading || !phone} onClick={handleRequestOtp} style={btnPrimary(loading || !phone)}>
                {loading ? '⏳ Envoi…' : 'Recevoir un code SMS →'}
              </button>
            </>
          )}

          {/* ── OTP : saisie du code ── */}
          {mode === 'otp_code' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <button onClick={() => setMode('otp_phone')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.1rem' }}>←</button>
                <h2 style={{ margin: 0, fontSize: '1rem', color: '#0F172A', fontWeight: 700 }}>Entrez votre code</h2>
              </div>
              <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: '0.78rem', color: '#0369a1' }}>
                Code envoyé au {phone}. Valable 10 minutes.
              </div>
              {devCode && (
                <div style={{ background: '#fef3c7', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.82rem', color: '#92400e', fontWeight: 700 }}>
                  🛠 Dev : code = <span style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>{devCode}</span>
                </div>
              )}
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>🔢 Code à 6 chiffres</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                style={{ ...inpStyle, letterSpacing: '0.3em', textAlign: 'center', fontSize: '1.6rem', marginBottom: 16 }} />
              {error && <div style={{ background: '#fee2e2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: '0.82rem' }}>{error}</div>}
              <button disabled={loading || otpCode.length < 6} onClick={() => onVerifyOtp(phone, otpCode)} style={btnPrimary(loading || otpCode.length < 6)}>
                {loading ? '⏳ Vérification…' : 'Valider →'}
              </button>
              <button onClick={handleRequestOtp} style={{ width: '100%', background: 'none', border: 'none', color: '#64748B', marginTop: 10, cursor: 'pointer', fontSize: '0.82rem', padding: '6px 0' }}>
                Renvoyer le code
              </button>
            </>
          )}

          {/* ── Connexion par mot de passe (sentinelles / agents) ── */}
          {mode === 'password' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <button onClick={() => setMode('choose')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.1rem' }}>←</button>
                <h2 style={{ margin: 0, fontSize: '1rem', color: '#0F172A', fontWeight: 700 }}>Connexion opérateur</h2>
              </div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>📱 Téléphone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+221700000001" style={{ ...inpStyle, marginBottom: 12 }} />
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>🔒 Mot de passe</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onLogin(phone, password)}
                style={{ ...inpStyle, marginBottom: 16 }} />
              {error && <div style={{ background: '#fee2e2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: '0.82rem' }}>{error}</div>}
              <button disabled={loading || !phone || !password} onClick={() => onLogin(phone, password)} style={btnPrimary(loading || !phone || !password)}>
                {loading ? '⏳ Connexion…' : 'Se connecter →'}
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ── HomeScreen ────────────────────────────────────────────────────────────────
function HomeScreen({ zoneStatus, activeCount, onReport, onAlerts, onMap, isSentinel }: {
  zoneStatus: typeof SEV_ZONE[0]; activeCount: number;
  onReport: () => void; onAlerts: () => void; onMap: () => void; isSentinel: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '0 0 24px' }}>
      {/* Bandeau statut zone : sobre, sans bordure agressive */}
      <div style={{ background: zoneStatus.bg, padding: '20px 24px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: zoneStatus.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          Région de Matam
        </div>
        <div style={{ fontSize: '1.05rem', fontWeight: 600, color: zoneStatus.color, letterSpacing: '-0.01em' }}>
          {zoneStatus.label}
        </div>
        {activeCount > 0 && (
          <div style={{ fontSize: '0.78rem', color: zoneStatus.color, opacity: 0.75, marginTop: 4 }}>
            {activeCount} alerte{activeCount > 1 ? 's' : ''} en cours
          </div>
        )}
      </div>

      {/* CTA principal : sobre, sans gradient ni ombre flashy */}
      <div style={{ padding: '24px 20px 12px' }}>
        <button onClick={onReport}
          style={{
            width: '100%', background: '#DC2626', color: 'white', border: 'none',
            padding: '20px 24px', borderRadius: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            textAlign: 'left',
          }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, letterSpacing: '-0.01em' }}>Signaler un risque</div>
            <div style={{ fontSize: '0.78rem', opacity: 0.8, marginTop: 2 }}>En 3 étapes, à n'importe quel moment</div>
          </div>
          <span style={{ fontSize: '1.3rem', fontWeight: 300 }}>›</span>
        </button>
      </div>

      {/* Cartes secondaires : flat, sobre */}
      <div style={{ padding: '8px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <InfoCard label="Alertes actives" value={String(activeCount)} sub="en cours" onClick={onAlerts} />
        {!isSentinel && <InfoCard label="Carte" value={'📍'} sub="Région Matam" onClick={onMap} />}
      </div>
    </div>
  );
}

function InfoCard({ label, value, sub, onClick }: { label: string; value: string; sub: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'white', borderRadius: 12, padding: '16px',
        border: '1px solid #F1F5F9', cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left', width: '100%',
      }}
    >
      <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: 2 }}>{sub}</div>
    </button>
  );
}

// ── ReportScreen : 3 étapes (thématique → option → confirm) ──────────────────
function ReportScreen({
  step, selectedTheme, selectedOption,
  onSelectTheme, onSelectOption, onSent, onBackToTheme, onBackToOption, onDone,
}: {
  step: 'theme' | 'option' | 'confirm' | 'done';
  selectedTheme: Theme | null;
  selectedOption: RiskOption | null;
  onSelectTheme: (t: Theme) => void;
  onSelectOption: (o: RiskOption) => void;
  onSent: () => void;
  onBackToTheme: () => void;
  onBackToOption: () => void;
  onDone: () => void;
}) {
  if (step === 'done') return <ReportSuccess onDone={onDone} />;
  if (step === 'confirm' && selectedTheme && selectedOption) {
    return <ReportConfirm theme={selectedTheme} option={selectedOption} onSent={onSent} onBack={onBackToOption} />;
  }
  if (step === 'option' && selectedTheme) {
    return <ReportOptionSelect theme={selectedTheme} onSelect={onSelectOption} onBack={onBackToTheme} />;
  }
  return <ReportThemeSelect onSelect={onSelectTheme} />;
}

function ReportThemeSelect({ onSelect }: { onSelect: (t: Theme) => void }) {
  return (
    <div style={{ padding: '20px 16px 24px' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Étape 1 / 3</div>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>Quel domaine concerne votre signalement ?</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {THEMES.map((th) => (
          <button key={th.key} onClick={() => onSelect(th)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 18px',
              border: '1px solid #E5E7EB', borderRadius: 12,
              background: 'white', cursor: 'pointer',
              textAlign: 'left',
              transition: 'border-color 0.15s, transform 0.05s',
            }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: th.color + '18', color: th.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.4rem', flexShrink: 0,
            }}>{th.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0F172A' }}>{th.label}</div>
              <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 2 }}>
                {th.options.map((o) => o.label).slice(0, 2).join(' · ')}
                {th.options.length > 2 && '…'}
              </div>
            </div>
            <span style={{ color: '#CBD5E1', fontSize: '1.1rem' }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReportOptionSelect({ theme, onSelect, onBack }: { theme: Theme; onSelect: (o: RiskOption) => void; onBack: () => void }) {
  return (
    <div style={{ padding: '16px 16px 24px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0 12px', display: 'block' }}>← Retour</button>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Étape 2 / 3 — {theme.label}</div>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>Précisez la situation</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {theme.options.map((option) => (
          <button key={option.id} onClick={() => onSelect(option)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px',
              border: '1px solid #E5E7EB', borderRadius: 10,
              background: 'white', cursor: 'pointer', textAlign: 'left',
            }}>
            <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{option.icon}</span>
            <span style={{ flex: 1, fontSize: '0.92rem', fontWeight: 500, color: '#0F172A' }}>{option.label}</span>
            <span style={{ color: '#CBD5E1', fontSize: '1.1rem' }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type GpsState = { state: 'idle' | 'acquiring' | 'ok' | 'denied' | 'timeout' | 'unavailable' | 'manual'; lat?: number; lng?: number };

function useGeolocation(opts?: { auto?: boolean }): GpsState & {
  retry: () => void;
  setManual: (lat: number, lng: number) => void;
} {
  const [state, setState] = useState<GpsState>({ state: 'idle' });
  const acquire = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setState({ state: 'unavailable' });
      return;
    }
    if (!window.isSecureContext) {
      setState({ state: 'manual' });
      return;
    }
    setState({ state: 'acquiring' });
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ state: 'ok', lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setState({ state: 'denied' });
        else if (err.code === err.TIMEOUT) setState({ state: 'timeout' });
        else setState({ state: 'unavailable' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, []);
  useEffect(() => {
    if (opts?.auto !== false) acquire();
  }, [acquire, opts?.auto]);
  return {
    ...state,
    retry: acquire,
    setManual: (lat, lng) => setState({ state: 'ok', lat, lng }),
  };
}

function GpsStatus({ gps, onRetry, onManual }: { gps: GpsState; onRetry: () => void; onManual: () => void }) {
  if (gps.state === 'ok' && gps.lat !== undefined && gps.lng !== undefined) {
    return (
      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D', padding: '10px 12px', borderRadius: 10, fontSize: '0.82rem' }}>
        📍 Position acquise : {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
      </div>
    );
  }
  if (gps.state === 'acquiring') {
    return <div style={{ background: '#FAFAFA', border: '1px solid #E5E7EB', color: '#64748B', padding: '10px 12px', borderRadius: 10, fontSize: '0.82rem' }}>📍 Acquisition de votre position…</div>;
  }
  const messages: Record<string, string> = {
    denied: '📍 GPS refusé. Autorisez la localisation dans les paramètres du navigateur, ou saisissez la position manuellement.',
    timeout: '📍 GPS trop lent (déplacez-vous à l\'extérieur), réessayez ou saisissez manuellement.',
    unavailable: '📍 GPS indisponible sur cet appareil. Saisissez la position manuellement.',
    manual: '📍 Connexion non sécurisée (HTTP) — la position doit être saisie manuellement.',
    idle: '📍 Position non encore acquise.',
  };
  return (
    <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', padding: '10px 12px', borderRadius: 10, fontSize: '0.8rem' }}>
      <div style={{ marginBottom: 6 }}>{messages[gps.state]}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onRetry} style={{ flex: 1, background: 'white', border: '1px solid #FDE68A', color: '#92400E', padding: '6px 10px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>↻ Réessayer GPS</button>
        <button onClick={onManual} style={{ flex: 1, background: 'white', border: '1px solid #FDE68A', color: '#92400E', padding: '6px 10px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>✍️ Saisir manuellement</button>
      </div>
    </div>
  );
}

function ManualGpsInput({ onSet }: { onSet: (lat: number, lng: number) => void }) {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [err, setErr] = useState('');
  const apply = () => {
    const la = parseFloat(lat.replace(',', '.'));
    const lo = parseFloat(lng.replace(',', '.'));
    if (Number.isNaN(la) || Number.isNaN(lo)) { setErr('Coordonnées invalides (ex. 15.6556 et -13.2553)'); return; }
    setErr(''); onSet(la, lo);
  };
  const inp: React.CSSProperties = { flex: 1, padding: '10px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box' };
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <input inputMode="decimal" placeholder="Latitude (ex. 15.6556)" value={lat} onChange={(e) => setLat(e.target.value)} style={inp} />
        <input inputMode="decimal" placeholder="Longitude (ex. -13.2553)" value={lng} onChange={(e) => setLng(e.target.value)} style={inp} />
      </div>
      <button onClick={apply} style={{ width: '100%', background: '#0F172A', color: 'white', border: 'none', padding: '10px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Utiliser ces coordonnées</button>
      {err && <div style={{ marginTop: 6, color: '#DC2626', fontSize: '0.78rem' }}>{err}</div>}
    </div>
  );
}

function ReportConfirm({ theme, option, onSent, onBack }: { theme: Theme; option: RiskOption; onSent: () => void; onBack: () => void }) {
  const [note, setNote] = useState('');
  const [captured, setCaptured] = useState<CapturedMedia[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showManualGps, setShowManualGps] = useState(false);
  const gps = useGeolocation({ auto: true });

  const handleSend = async () => {
    setSending(true); setError('');
    try {
      const token = localStorage.getItem('olel_token');
      if (!token) { setError('Vous devez être connecté pour signaler.'); setSending(false); return; }

      const zoneId = process.env.NEXT_PUBLIC_DEFAULT_ZONE_ID || undefined;
      const mediaUrls = captured.map((m) => m.url);
      const description = (option.descPrefix || '') + (note.trim() || `Signalement de type ${option.label} depuis l'application mobile.`);
      const payload = {
        title: `Signalement : ${option.label}`,
        description,
        type: option.type as AlertTypeValue,
        severity: 2,
        channel: 'app',
        ...(zoneId ? { zoneId } : {}),
        ...(mediaUrls.length ? { mediaUrls } : {}),
        latitude: gps.lat, longitude: gps.lng,
      };

      if (!navigator.onLine) {
        await queueSignalement(payload);
        onSent();
        return;
      }

      await axios.post(`${API}/alerts`, payload, { headers: { Authorization: `Bearer ${token}` } });
      onSent();
    } catch (e: any) {
      const msg = e.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur lors de l\'envoi'));
    } finally { setSending(false); }
  };

  return (
    <div style={{ padding: '16px 16px 28px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0 12px', display: 'block' }}>← Retour</button>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Étape 3 / 3</div>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>Confirmer le signalement</h2>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: theme.color + '18', color: theme.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>{option.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{theme.label}</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0F172A' }}>{option.label}</div>
        </div>
      </div>

      <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem', color: '#0F172A' }}>
        Précisions <span style={{ fontWeight: 400, color: '#94A3B8' }}>(facultatif)</span>
      </label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Décrivez ce que vous observez : lieu, ampleur, personnes touchées…" rows={3}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid #E5E7EB', borderRadius: 10, fontSize: '0.92rem', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 16, outline: 'none' }} />

      <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem', color: '#0F172A' }}>
        Photo / vocal <span style={{ fontWeight: 400, color: '#94A3B8' }}>(recommandé)</span>
      </label>
      <div style={{ marginBottom: 16 }}><MediaCapture onChange={setCaptured} /></div>

      <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem', color: '#0F172A' }}>Position</label>
      <div style={{ marginBottom: 8 }}>
        <GpsStatus gps={gps} onRetry={gps.retry} onManual={() => setShowManualGps(true)} />
      </div>
      {(showManualGps || ['denied','timeout','unavailable','manual'].includes(gps.state)) && gps.state !== 'ok' && (
        <ManualGpsInput onSet={(la, lo) => { gps.setManual(la, lo); setShowManualGps(false); }} />
      )}
      <div style={{ height: 16 }} />

      {error && <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '10px 12px', borderRadius: 10, marginBottom: 12, fontSize: '0.82rem' }}>{error}</div>}

      <button disabled={sending} onClick={handleSend}
        style={{ width: '100%', background: '#0F172A', color: 'white', border: 'none', padding: '14px', borderRadius: 12, fontSize: '0.98rem', fontWeight: 600, cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
        {sending ? 'Envoi en cours…' : 'Envoyer le signalement'}
      </button>
    </div>
  );
}

function ReportSuccess({ onDone }: { onDone: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60dvh', padding: '0 24px', textAlign: 'center' }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: '#DCFCE7', color: '#16A34A',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.6rem', fontWeight: 600, marginBottom: 20,
      }}>✓</div>
      <h2 style={{ color: '#0F172A', margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Signalement envoyé</h2>
      <p style={{ color: '#64748B', margin: '0 0 28px', lineHeight: 1.6, maxWidth: 320, fontSize: '0.92rem' }}>
        Votre signalement a été transmis aux autorités. Un agent va l&apos;examiner.
      </p>
      <button onClick={onDone} style={{ background: '#0F172A', color: 'white', border: 'none', padding: '13px 28px', borderRadius: 10, fontSize: '0.92rem', fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.01em' }}>
        Voir les alertes
      </button>
    </div>
  );
}

// ── AlertsScreen ──────────────────────────────────────────────────────────────
function AlertsScreen({ alerts, loading, onRefresh }: { alerts: MobileAlert[]; loading: boolean; onRefresh: () => void }) {
  if (loading) return <div style={{ textAlign: 'center', padding: 56, color: '#94A3B8', fontSize: '0.9rem' }}>Chargement…</div>;
  return (
    <div style={{ padding: '20px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>Alertes</h2>
          <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: 2 }}>{alerts.length} actives</div>
        </div>
        <button onClick={onRefresh} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 12px', color: '#64748B', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500 }}>Actualiser</button>
      </div>
      {!alerts.length ? (
        <div style={{ textAlign: 'center', padding: '64px 20px', color: '#64748B' }}>
          <p style={{ margin: 0, fontSize: '0.92rem' }}>Aucune alerte active dans votre zone.</p>
          <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#94A3B8' }}>Tirez vers le bas pour actualiser</p>
        </div>
      ) : alerts.map((a) => {
        const color = SEV_COLOR[a.severity] || '#888';
        const meta = RISK_ICONS[a.type] || RISK_ICONS.AUTRE;
        return (
          <div key={a.id} style={{ background: 'white', borderRadius: 12, padding: '16px', marginBottom: 10, border: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: color + '14', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>{meta.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#0F172A', lineHeight: 1.3 }}>{a.title}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 2 }}>{a.zone?.name || 'Matam'} · {STATUS_LABEL[a.status] || a.status}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
                <LevelBadge level={a.alertLevel} />
              </div>
            </div>
            <p style={{ margin: '0 0 4px', color: '#475569', fontSize: '0.83rem', lineHeight: 1.5 }}>{a.description}</p>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 8 }}>{new Date(a.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── MapScreen ─────────────────────────────────────────────────────────────────
// Matam city center coordinates
const MATAM_CENTER: [number, number] = [15.6556, -13.2553];

function MapScreen({ alerts }: { alerts: MobileAlert[] }) {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;

    // Inject Leaflet CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    let map: any;
    import('leaflet').then((L) => {
      if (!mapRef.current) return;
      // Avoid double-init if component remounts
      if ((mapRef.current as any)._leaflet_id) return;

      map = L.map(mapRef.current, { zoomControl: true }).setView(MATAM_CENTER, 11);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      // Fix default marker icon paths broken by webpack
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Matam center marker
      L.marker(MATAM_CENTER).addTo(map).bindPopup('Matam — centre de coordination OLEL');

      // Alert markers
      alerts.forEach((a) => {
        const lat = (a as any).latitude ?? MATAM_CENTER[0];
        const lng = (a as any).longitude ?? MATAM_CENTER[1];
        const color = SEV_COLOR[a.severity] || '#888';
        const meta = RISK_ICONS[a.type] || RISK_ICONS.AUTRE;

        const icon = L.divIcon({
          html: `<div style="background:${color};color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:1rem;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${meta.icon}</div>`,
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(`<b>${meta.icon} ${a.title}</b><br>${a.description || ''}<br><small>${STATUS_LABEL[a.status] || a.status}</small>`);
      });
    });

    return () => { if (map) map.remove(); };
  }, [alerts]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 52px - 56px)' }}>
      <div style={{ padding: '10px 16px 6px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', color: '#0F172A' }}>🗺️ Carte des risques — Matam</h2>
        <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{alerts.length} alerte{alerts.length !== 1 ? 's' : ''}</span>
      </div>
      <div ref={mapRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}

// ── ProfileScreen ─────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  CITOYEN:          { label: 'Citoyen',          color: '#16A34A' },
  SENTINELLE:       { label: 'Sentinelle',        color: '#0891b2' },
  MAIRIE:           { label: 'Agent Mairie',      color: '#7c3aed' },
  PREFECTURE:       { label: 'Agent Préfecture',  color: '#ea580c' },
  GOUVERNORAT:      { label: 'Gouvernorat',       color: '#DC2626' },
  PROTECTION_CIVILE:{ label: 'Protection Civile', color: '#DC2626' },
  ADMIN:            { label: 'Administrateur',    color: '#0F172A' },
  SUPER_ADMIN:      { label: 'Super Admin',       color: '#0F172A' },
};

function ProfileScreen({ user, onLogout }: { user: { id: string; name: string; phone: string; role: string }; onLogout: () => void }) {
  const roleInfo = ROLE_LABEL[user.role] || { label: user.role, color: '#64748B' };
  return (
    <div style={{ padding: '20px 16px 32px' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: '1.2rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>Profil</h2>

      {/* Identité */}
      <div style={{ background: 'white', borderRadius: 12, padding: '20px', marginBottom: 12, border: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: roleInfo.color + '14', color: roleInfo.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', fontWeight: 700, flexShrink: 0,
            letterSpacing: '-0.01em',
          }}>
            {user.name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase() || 'OL'}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.98rem', color: '#0F172A' }}>{user.name}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: 2 }}>{user.phone}</div>
          </div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 600, color: roleInfo.color, background: roleInfo.color + '0D', padding: '4px 10px', borderRadius: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: roleInfo.color }} />
          {roleInfo.label}
        </div>
      </div>

      {/* Langue */}
      <div style={{ background: 'white', borderRadius: 12, padding: '16px', marginBottom: 12, border: '1px solid #F1F5F9' }}>
        <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Langue / Ɗemngal / Làkk</div>
        <LanguageSelector />
        <p style={{ fontSize: '0.74rem', color: '#94A3B8', margin: '10px 0 0' }}>Vos alertes vous seront envoyées dans cette langue.</p>
      </div>

      {/* Plateforme */}
      <div style={{ background: 'white', borderRadius: 12, padding: '16px', marginBottom: 20, border: '1px solid #F1F5F9' }}>
        <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Plateforme</div>
        {[
          { label: 'Zone',    value: 'Région de Matam' },
          { label: 'Version', value: 'OLEL v1.0' },
          { label: 'Session', value: 'Sécurisée' },
        ].map(({ label, value }, i, arr) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 10, borderBottom: i === arr.length - 1 ? 'none' : '1px solid #F1F5F9' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748B' }}>{label}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#0F172A' }}>{value}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onLogout}
        style={{ width: '100%', background: 'white', color: '#DC2626', border: '1px solid #FEE2E2', padding: '13px', borderRadius: 10, fontSize: '0.92rem', fontWeight: 600, cursor: 'pointer' }}
      >
        Se déconnecter
      </button>

      <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.72rem', color: '#CBD5E1' }}>OLEL · Matam, Sénégal</p>
    </div>
  );
}

// ── FormationsScreen ──────────────────────────────────────────────────────────
interface TrainingModule {
  id: string; title: string; description: string; category: string; isRequired: boolean;
  durationMin: number; progress: { completed: boolean; score: number | null; completedAt: string | null };
  lessons: { id: string; title: string; order: number }[];
}

const CATEGORY_LABEL: Record<string, { icon: string; label: string; color: string }> = {
  SECOURISME:     { icon: '🩺', label: 'Secourisme',    color: '#16A34A' },
  RISQUE_LOCAL:   { icon: '🌊', label: 'Risques locaux', color: '#2563eb' },
  PROCEDURE:      { icon: '📋', label: 'Procédures',    color: '#7c3aed' },
  SENSIBILISATION:{ icon: '📣', label: 'Sensibilisation',color: '#ea580c' },
};

function FormationsScreen() {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ certified: boolean; requiredDone: number; requiredTotal: number; completedCount: number; totalModules: number } | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('olel_token');
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      axios.get(`${API}/trainings`, { headers }),
      axios.get(`${API}/trainings/me/status`, { headers }),
    ]).then(([mRes, sRes]) => {
      setModules(mRes.data || []);
      setStatus(sRes.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleComplete = async (moduleId: string) => {
    const token = localStorage.getItem('olel_token');
    if (!token) return;
    setCompleting(moduleId);
    try {
      await axios.post(`${API}/trainings/${moduleId}/complete`, {}, { headers: { Authorization: `Bearer ${token}` } });
      const [mRes, sRes] = await Promise.all([
        axios.get(`${API}/trainings`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/trainings/me/status`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setModules(mRes.data || []);
      setStatus(sRes.data);
    } catch { /* ignore */ } finally { setCompleting(null); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 56, color: '#94A3B8', fontSize: '2.5rem' }}>⏳</div>;

  return (
    <div style={{ padding: '16px' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: '1.05rem', color: '#0F172A' }}>📚 Formations</h2>

      {status && (
        <div style={{ background: status.certified ? '#dcfce7' : '#fef9c3', border: `1.5px solid ${status.certified ? '#16A34A' : '#ca8a04'}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 800, color: status.certified ? '#16A34A' : '#ca8a04', fontSize: '0.92rem', marginBottom: 4 }}>
            {status.certified ? '✅ Certification obtenue' : '⚠️ Certification en cours'}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#374151' }}>
            Modules requis : {status.requiredDone}/{status.requiredTotal} · Total complétés : {status.completedCount}/{status.totalModules}
          </div>
        </div>
      )}

      {modules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📚</div>
          <p style={{ margin: 0 }}>Aucun module de formation disponible.</p>
        </div>
      ) : modules.map((m) => {
        const cat = CATEGORY_LABEL[m.category] || { icon: '📖', label: m.category, color: '#64748B' };
        return (
          <div key={m.id} style={{ background: 'white', borderRadius: 12, marginBottom: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden', borderLeft: `4px solid ${m.progress.completed ? '#16A34A' : (m.isRequired ? '#DC2626' : cat.color)}` }}>
            <div style={{ padding: '14px 14px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: '1rem' }}>{cat.icon}</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: cat.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cat.label}</span>
                    {m.isRequired && <span style={{ fontSize: '0.62rem', background: '#fee2e2', color: '#DC2626', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>REQUIS</span>}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>{m.title}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {m.progress.completed ? (
                    <div style={{ fontSize: '1.4rem' }}>✅</div>
                  ) : (
                    <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>⏱ {m.durationMin} min</div>
                  )}
                </div>
              </div>
              <p style={{ margin: '0 0 10px', color: '#64748B', fontSize: '0.8rem', lineHeight: 1.4 }}>{m.description}</p>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginBottom: 10 }}>
                {m.lessons.length} leçon{m.lessons.length > 1 ? 's' : ''}
                {m.progress.completed && m.progress.completedAt && (
                  <> · Complété le {new Date(m.progress.completedAt).toLocaleDateString('fr-FR')}</>
                )}
                {m.progress.completed && m.progress.score != null && (
                  <> · Score : {m.progress.score}%</>
                )}
              </div>
              {!m.progress.completed && (
                <button
                  disabled={completing === m.id}
                  onClick={() => handleComplete(m.id)}
                  style={{ width: '100%', background: '#0F172A', color: 'white', border: 'none', padding: '10px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', opacity: completing === m.id ? 0.6 : 1 }}
                >
                  {completing === m.id ? '⏳ Enregistrement…' : '✔️ Marquer comme complété'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── MissionsScreen ────────────────────────────────────────────────────────────
interface Mission {
  id: string; assignmentId: string; title: string; description: string;
  type: string; status: string; zone?: { name: string };
  dueAt: string | null; assignedAt: string; completedAt: string | null;
}

const MISSION_TYPE_ICON: Record<string, string> = {
  VERIFICATION: '🔍', PATROUILLE: '🚶', SENSIBILISATION: '📣', EVACUATION: '🚨',
};
const MISSION_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  OPEN:        { label: 'Ouverte',      color: '#64748B' },
  ASSIGNED:    { label: 'Assignée',     color: '#2563eb' },
  IN_PROGRESS: { label: 'En cours',     color: '#ea580c' },
  DONE:        { label: 'Terminée',     color: '#16A34A' },
  CANCELLED:   { label: 'Annulée',      color: '#94A3B8' },
};

function MissionsScreen() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  const fetchMissions = async () => {
    const token = localStorage.getItem('olel_token');
    if (!token) return;
    try {
      const { data } = await axios.get(`${API}/missions/me`, { headers: { Authorization: `Bearer ${token}` } });
      setMissions(data || []);
    } catch { /* offline */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchMissions(); }, []);

  const doAction = async (missionId: string, action: 'accept' | 'complete') => {
    const token = localStorage.getItem('olel_token');
    if (!token) return;
    setActing(missionId + action);
    try {
      const body = action === 'complete' ? { report: report[missionId] || '' } : {};
      await axios.post(`${API}/missions/${missionId}/${action}`, body, { headers: { Authorization: `Bearer ${token}` } });
      await fetchMissions();
    } catch { /* ignore */ } finally { setActing(null); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 56, color: '#94A3B8', fontSize: '2.5rem' }}>⏳</div>;

  const active = missions.filter((m) => m.status !== 'DONE' && m.status !== 'CANCELLED');
  const done = missions.filter((m) => m.status === 'DONE');

  return (
    <div style={{ padding: '16px' }}>
      <h2 style={{ margin: '0 0 14px', fontSize: '1.05rem', color: '#0F172A' }}>📋 Mes missions ({active.length} active{active.length > 1 ? 's' : ''})</h2>

      {missions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📋</div>
          <p style={{ margin: 0 }}>Aucune mission assignée pour le moment.</p>
        </div>
      ) : <>
        {active.map((m) => {
          const st = MISSION_STATUS_LABEL[m.status] || { label: m.status, color: '#64748B' };
          const icon = MISSION_TYPE_ICON[m.type] || '📋';
          const isAccepting = acting === m.id + 'accept';
          const isCompleting = acting === m.id + 'complete';
          return (
            <div key={m.assignmentId} style={{ background: 'white', borderRadius: 12, marginBottom: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', borderLeft: `4px solid ${st.color}` }}>
              <div style={{ padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>{icon} {m.title}</div>
                  <span style={{ fontSize: '0.68rem', background: st.color + '22', color: st.color, padding: '2px 8px', borderRadius: 8, fontWeight: 700, whiteSpace: 'nowrap' }}>{st.label}</span>
                </div>
                <p style={{ margin: '0 0 8px', color: '#64748B', fontSize: '0.8rem', lineHeight: 1.4 }}>{m.description}</p>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginBottom: 10 }}>
                  📍 {m.zone?.name || 'Matam'}
                  {m.dueAt && <> · ⏰ Avant le {new Date(m.dueAt).toLocaleDateString('fr-FR')}</>}
                </div>

                {m.status === 'ASSIGNED' && (
                  <button disabled={isAccepting} onClick={() => doAction(m.id, 'accept')}
                    style={{ width: '100%', background: '#2563eb', color: 'white', border: 'none', padding: '10px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', marginBottom: 0, opacity: isAccepting ? 0.6 : 1 }}>
                    {isAccepting ? '⏳…' : '▶️ Accepter et démarrer'}
                  </button>
                )}

                {m.status === 'IN_PROGRESS' && (
                  <div>
                    <textarea
                      value={report[m.id] || ''}
                      onChange={(e) => setReport((r) => ({ ...r, [m.id]: e.target.value }))}
                      placeholder="Compte-rendu de mission (facultatif)…"
                      rows={2}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.82rem', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 8 }}
                    />
                    <button disabled={isCompleting} onClick={() => doAction(m.id, 'complete')}
                      style={{ width: '100%', background: '#16A34A', color: 'white', border: 'none', padding: '10px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', opacity: isCompleting ? 0.6 : 1 }}>
                      {isCompleting ? '⏳…' : '✅ Clôturer la mission'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {done.length > 0 && (
          <>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '16px 0 8px' }}>Missions terminées</div>
            {done.map((m) => (
              <div key={m.assignmentId} style={{ background: '#FAFAFA', borderRadius: 10, padding: '10px 14px', marginBottom: 8, opacity: 0.8, borderLeft: '4px solid #16A34A' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#374151' }}>{MISSION_TYPE_ICON[m.type] || '📋'} {m.title}</div>
                {m.completedAt && <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 3 }}>Clôturée le {new Date(m.completedAt).toLocaleDateString('fr-FR')}</div>}
              </div>
            ))}
          </>
        )}
      </>}
    </div>
  );
}
// ── SentinelValidationScreen ──────────────────────────────────────────────────
function SentinelValidationScreen({ alerts, signalements, onDone }: { alerts: MobileAlert[]; signalements: MobileSignalement[]; onDone: () => void }) {
  const [selected, setSelected] = useState<MobileAlert | null>(null);
  const [verifying, setVerifying] = useState<MobileSignalement | null>(null);

  if (selected) {
    return <SentinelValidationForm alert={selected} onBack={() => setSelected(null)} onDone={() => { setSelected(null); onDone(); }} />;
  }
  if (verifying) {
    return <SignalementFieldVerifyForm signalement={verifying} onBack={() => setVerifying(null)} onDone={() => { setVerifying(null); onDone(); }} />;
  }

  return (
    <div style={{ padding: 16 }}>
      {/* ── Signalements citoyens (WhatsApp/USSD) en attente de vérification terrain ── */}
      {signalements.length > 0 && (
        <>
          <h2 style={{ margin: '0 0 10px', fontSize: '1.05rem', color: '#0F172A' }}>📢 Signalements citoyens ({signalements.length})</h2>
          {signalements.map((sg) => {
            const meta = RISK_ICONS[sg.type] || RISK_ICONS.AUTRE;
            const needsField = !sg.fieldVerifiedAt && !(sg.latitude && sg.longitude);
            return (
              <div key={sg.id} style={{ background: 'white', borderRadius: 12, padding: 14, marginBottom: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', borderLeft: `4px solid ${needsField ? '#f59e0b' : '#16A34A'}` }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A', marginBottom: 4 }}>{meta.icon} {meta.label}</div>
                <p style={{ margin: '0 0 8px', color: '#555', fontSize: '0.82rem', lineHeight: 1.4 }}>{sg.text}</p>
                {(sg as any).mediaUrls?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                    {(sg as any).mediaUrls.map((url: string, i: number) => (
                      isAudioUrl(url) ? (
                        <div key={i} style={{ background: '#f1f5f9', borderRadius: 8, padding: '6px 8px' }}>
                          <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: 3, fontWeight: 600 }}>🎙️ Vocal — écoutez</div>
                          <audio controls preload="none" src={url} style={{ width: '100%', height: 32 }} />
                        </div>
                      ) : (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt="preuve" style={{ maxWidth: 120, maxHeight: 120, borderRadius: 8, objectFit: 'cover' }} />
                        </a>
                      )
                    ))}
                  </div>
                )}
                <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginBottom: 8 }}>
                  {sg.user && <>👤 {sg.user.name} · </>}via {sg.channel} · {new Date(sg.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
                {sg.fieldVerifiedAt ? (
                  <div style={{ background: '#dcfce7', color: '#166534', padding: '6px 10px', borderRadius: 8, fontSize: '0.76rem' }}>
                    ✔️ Vérifié sur place — en attente de validation mairie
                  </div>
                ) : needsField ? (
                  <button onClick={() => setVerifying(sg)}
                    style={{ width: '100%', background: '#0ea5e9', color: 'white', border: 'none', padding: '10px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                    🔭 Vérifier sur place →
                  </button>
                ) : (
                  <div style={{ background: '#e0f2fe', color: '#0369a1', padding: '6px 10px', borderRadius: 8, fontSize: '0.76rem' }}>
                    📍 GPS/photo fournis — en attente de validation mairie
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ height: 8 }} />
        </>
      )}

      <h2 style={{ margin: '0 0 14px', fontSize: '1.05rem', color: '#0F172A' }}>✔️ Alertes à valider ({alerts.length})</h2>
      {alerts.length === 0 && signalements.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>✅</div>
          <p style={{ margin: 0 }}>Aucun signalement en attente de validation.</p>
        </div>
      ) : alerts.length === 0 ? (
        <p style={{ color: '#94A3B8', fontSize: '0.82rem' }}>Aucune alerte en attente.</p>
      ) : alerts.map((a) => {
        const meta = RISK_ICONS[a.type] || RISK_ICONS.AUTRE;
        const color = SEV_COLOR[a.severity] || '#888';
        return (
          <div key={a.id} style={{ background: 'white', borderRadius: 12, padding: 14, marginBottom: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', borderLeft: `4px solid ${color}` }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A', marginBottom: 4 }}>{meta.icon} {a.title}</div>
            <p style={{ margin: '0 0 10px', color: '#555', fontSize: '0.82rem', lineHeight: 1.4 }}>{a.description}</p>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginBottom: 10 }}>📍 {a.zone?.name || 'Matam'} · {STATUS_LABEL[a.status] || a.status}</div>
            <button onClick={() => setSelected(a)}
              style={{ width: '100%', background: '#0F172A', color: 'white', border: 'none', padding: '10px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
              Valider / Rejeter ce signalement →
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SentinelValidationForm({ alert, onBack, onDone }: { alert: MobileAlert; onBack: () => void; onDone: () => void }) {
  const [action, setAction] = useState<'VALIDATED' | 'REJECTED' | 'ESCALATED'>('VALIDATED');
  const [gravity, setGravity] = useState(1);
  const [alertLevel, setAlertLevel] = useState<AlertLevel>((alert.alertLevel as AlertLevel) || 'BLEU');
  const [comment, setComment] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (navigator.geolocation && typeof window !== 'undefined' && window.isSecureContext) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => setGpsError(
          err.code === err.PERMISSION_DENIED
            ? 'GPS refusé par le navigateur — autorisez la localisation'
            : err.code === err.TIMEOUT
              ? 'GPS trop lent — déplacez-vous à l\'extérieur et réessayez'
              : 'GPS indisponible — position manuelle requise',
        ),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    } else {
      setGpsError('GPS bloqué (connexion HTTP) — position manuelle requise');
    }
  }, []);

  const handleSubmit = async () => {
    if (action !== 'REJECTED') {
      if (!gps) { setError('Position GPS requise pour valider'); return; }
      if (!photoUrl.trim()) { setError('URL de la photo de preuve requise'); return; }
    }
    setSending(true); setError('');
    try {
      const token = localStorage.getItem('olel_token');
      await axios.post(`${API}/alerts/${alert.id}/advance`, {
        action,
        gravity: action === 'REJECTED' ? undefined : gravity,
        alertLevel: action === 'REJECTED' ? undefined : alertLevel,
        comment: comment.trim() || undefined,
        photoUrl: action === 'REJECTED' ? undefined : photoUrl.trim(),
        latitude: gps?.lat,
        longitude: gps?.lng,
      }, { headers: { Authorization: `Bearer ${token}` } });
      onDone();
    } catch (e: any) {
      const msg = e.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur lors de la validation'));
    } finally { setSending(false); }
  };

  const meta = RISK_ICONS[alert.type] || RISK_ICONS.AUTRE;

  return (
    <div style={{ padding: '16px 20px 32px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0 12px', display: 'block' }}>← Retour</button>
      <h2 style={{ margin: '0 0 14px', fontSize: '1rem', color: '#0F172A' }}>Validation terrain</h2>

      <div style={{ background: '#FAFAFA', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.88rem' }}>
        <b>{meta.icon} {alert.title}</b><br />
        <span style={{ color: '#64748B', fontSize: '0.8rem' }}>{alert.description}</span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#374151', marginBottom: 6 }}>Action</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['VALIDATED', '✅ Valider', '#16A34A'], ['REJECTED', '❌ Rejeter', '#DC2626'], ['ESCALATED', '⬆️ Escalader', '#ea580c']] as const).map(([val, label, color]) => (
            <button key={val} onClick={() => setAction(val)}
              style={{ flex: 1, padding: '8px 4px', border: `2px solid ${action === val ? color : '#E5E7EB'}`, borderRadius: 8, background: action === val ? color + '22' : 'white', color: action === val ? color : '#64748B', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {action !== 'REJECTED' && (
        <>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#374151', marginBottom: 6 }}>Niveau de gravité (0 = faible, 3 = critique)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[0, 1, 2, 3].map((g) => (
                <button key={g} onClick={() => setGravity(g)}
                  style={{ flex: 1, padding: '10px 4px', border: `2px solid ${gravity === g ? '#0F172A' : '#E5E7EB'}`, borderRadius: 8, background: gravity === g ? '#0F172A' : 'white', color: gravity === g ? 'white' : '#64748B', fontWeight: 800, cursor: 'pointer' }}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#374151', marginBottom: 6 }}>Niveau d'alerte</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(LEVEL_CONFIG) as AlertLevel[]).map((lvl) => {
                const cfg = LEVEL_CONFIG[lvl];
                const on = alertLevel === lvl;
                return (
                  <button key={lvl} onClick={() => setAlertLevel(lvl)}
                    style={{ flex: '1 1 30%', padding: '7px 4px', border: `2px solid ${on ? cfg.color : '#E5E7EB'}`, borderRadius: 8, background: on ? cfg.bg : 'white', color: on ? cfg.color : '#64748B', fontWeight: 700, fontSize: '0.68rem', cursor: 'pointer' }}>
                    {cfg.icon} {cfg.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: 4 }}>
              Orange et plus exigent une triple validation avant diffusion.
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#374151', marginBottom: 6 }}>📷 URL photo de preuve *</label>
            <input type="url" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://..." style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box' as const }} />
          </div>

          <div style={{ marginBottom: 14, padding: '8px 12px', background: gps ? '#dcfce7' : '#fef9c3', borderRadius: 8, fontSize: '0.78rem', color: gps ? '#16A34A' : '#92400e' }}>
            {gps ? `📍 GPS : ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : (gpsError || '📍 Acquisition GPS en cours…')}
          </div>
        </>
      )}

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#374151', marginBottom: 6 }}>Commentaire (facultatif)</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
          placeholder="Observations de terrain…"
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.85rem', resize: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: '0.82rem' }}>{error}</div>}

      <button disabled={sending} onClick={handleSubmit}
        style={{ width: '100%', background: action === 'REJECTED' ? '#DC2626' : '#0F172A', color: 'white', border: 'none', padding: '14px', borderRadius: 12, fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
        {sending ? '⏳ Envoi…' : action === 'VALIDATED' ? '✅ Valider le signalement' : action === 'REJECTED' ? '❌ Rejeter le signalement' : '⬆️ Escalader à la préfecture'}
      </button>
    </div>
  );
}

// ── SignalementFieldVerifyForm ────────────────────────────────────────────────
// Vérification terrain d'un signalement citoyen (cursus OLEL) : la sentinelle
// se rend sur place, relève la position (GPS, ou saisie manuelle quand le
// navigateur bloque la géolocalisation en HTTP) et ajoute ses observations.
function SignalementFieldVerifyForm({ signalement, onBack, onDone }: { signalement: MobileSignalement; onBack: () => void; onDone: () => void }) {
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'pending' | 'ok' | 'manual'>('pending');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [notes, setNotes] = useState('');
  const [captured, setCaptured] = useState<CapturedMedia[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (navigator.geolocation && window.isSecureContext) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsStatus('ok'); },
        () => setGpsStatus('manual'),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    } else {
      setGpsStatus('manual');
    }
  }, []);

  const handleSubmit = async () => {
    let lat: number, lng: number;
    if (gps) { lat = gps.lat; lng = gps.lng; }
    else {
      lat = parseFloat(manualLat.replace(',', '.'));
      lng = parseFloat(manualLng.replace(',', '.'));
      if (Number.isNaN(lat) || Number.isNaN(lng)) { setError('Coordonnées invalides (ex. 15.6556 et -13.2553)'); return; }
    }
    setSending(true); setError('');
    try {
      const token = localStorage.getItem('olel_token');
      const mediaUrls = captured.map((m) => m.url);
      await axios.patch(`${API}/signalements/${signalement.id}/field-verify`,
        {
          latitude: lat, longitude: lng,
          notes: notes.trim() || undefined,
          ...(mediaUrls.length ? { mediaUrls } : {}),
        },
        { headers: { Authorization: `Bearer ${token}` } });
      onDone();
    } catch (e: any) {
      const msg = e.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur lors de la vérification'));
    } finally { setSending(false); }
  };

  const meta = RISK_ICONS[signalement.type] || RISK_ICONS.AUTRE;
  const inp = { width: '100%', padding: '10px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: '0.92rem', boxSizing: 'border-box' as const };

  return (
    <div style={{ padding: '16px 20px 32px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0 12px', display: 'block' }}>← Retour</button>
      <h2 style={{ margin: '0 0 14px', fontSize: '1rem', color: '#0F172A' }}>🔭 Vérification terrain</h2>

      <div style={{ background: '#FAFAFA', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.88rem' }}>
        <b>{meta.icon} {meta.label}</b><br />
        <span style={{ color: '#64748B', fontSize: '0.8rem' }}>{signalement.text}</span>
      </div>

      {gpsStatus === 'pending' && (
        <div style={{ background: '#fef9c3', color: '#92400e', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: '0.8rem' }}>
          📍 Acquisition GPS en cours…
        </div>
      )}
      {gpsStatus === 'ok' && gps && (
        <div style={{ background: '#dcfce7', color: '#16A34A', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: '0.8rem' }}>
          📍 Position acquise : {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
        </div>
      )}
      {gpsStatus === 'manual' && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ background: '#fef3c7', color: '#92400e', padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: '0.78rem' }}>
            ⚠️ GPS bloqué par le navigateur (connexion HTTP). Saisissez la position du lieu :
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input inputMode="decimal" placeholder="Latitude (ex. 15.6556)" value={manualLat}
              onChange={(e) => setManualLat(e.target.value)} style={inp} />
            <input inputMode="decimal" placeholder="Longitude (ex. -13.2553)" value={manualLng}
              onChange={(e) => setManualLng(e.target.value)} style={inp} />
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#374151', marginBottom: 6 }}>Observations terrain</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          placeholder="Ampleur, victimes, accessibilité, besoins urgents…"
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.85rem', resize: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#374151', marginBottom: 6 }}>📷 Photo sur place (preuve)</label>
        <MediaCapture onChange={setCaptured} />
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: '0.82rem' }}>{error}</div>}

      <button disabled={sending || gpsStatus === 'pending'} onClick={handleSubmit}
        style={{ width: '100%', background: '#0ea5e9', color: 'white', border: 'none', padding: '14px', borderRadius: 12, fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer', opacity: sending || gpsStatus === 'pending' ? 0.6 : 1 }}>
        {sending ? '⏳ Envoi…' : '✔️ Confirmer la vérification sur place'}
      </button>
    </div>
  );
}

function SosModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9998, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ background: 'white', width: '100%', borderRadius: '20px 20px 0 0', padding: '20px 20px 28px', maxWidth: 480, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <h2 style={{ margin: 0, color: '#0F172A', fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Numéros d&apos;urgence</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '0.85rem', cursor: 'pointer', color: '#64748B' }}>Fermer</button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: '#64748B' }}>Appel direct — tarif standard</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'Sapeurs-Pompiers',     number: '18' },
            { label: 'Police / Gendarmerie', number: '17' },
            { label: 'SAMU Sénégal',         number: '15' },
            { label: 'Protection Civile',    number: '33 869 19 20' },
          ].map(({ label, number }) => (
            <a key={number} href={`tel:${number.replace(/\s/g, '')}`}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 16px', background: 'white',
                borderRadius: 10, border: '1px solid #E5E7EB',
                textDecoration: 'none',
              }}>
              <span style={{ fontWeight: 500, color: '#0F172A', fontSize: '0.92rem' }}>{label}</span>
              <span style={{ fontWeight: 600, fontSize: '1rem', color: '#DC2626', letterSpacing: '0.02em' }}>{number}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
