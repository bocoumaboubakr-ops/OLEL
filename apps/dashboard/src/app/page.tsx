'use client';

import { useEffect, useState } from 'react';
import { AlertsFeed } from '@/components/alerts/AlertsFeed';
import { AlertMap } from '@/components/map/AlertMap';
import { AlertDetail } from '@/components/alerts/AlertDetail';
import { useAlerts } from '@/hooks/useAlerts';
import { useAuth } from '@/hooks/useAuth';
import { StatsBar } from '@/components/layout/StatsBar';
import { CreateAlertModal } from '@/components/alerts/CreateAlertModal';
import { ACTIVE_STATUSES } from '@/components/alerts/AlertsFeed';
import { canCreate as canCreateRole, ROLE_LABELS, ROLE_LEVEL } from '@/lib/governance';

export default function DashboardPage() {
  const { user, initialized, logout } = useAuth();
  const { alerts, loading, refetch } = useAlerts();
  const [selected, setSelected] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'all'>('active');

  if (!initialized) return null;
  if (!user) return <LoginRedirect />;

  const canCreate = canCreateRole(user.role);
  const roleLvl = ROLE_LEVEL[user.role] ?? 0;
  const filteredAlerts = activeTab === 'active'
    ? alerts.filter((a) => ACTIVE_STATUSES.includes(a.status))
    : alerts;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* ── Header sobre, fond blanc, sans gradient ───────────────────────── */}
      <header style={{
        background: 'white',
        borderBottom: '1px solid #F1F5F9',
        padding: '0 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        height: 56, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>OLEL</span>
          <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 500 }}>
            Alerte précoce · Matam
          </span>
        </div>
        <nav style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <NavLink href="/" active>Tableau de bord</NavLink>
          <NavLink href="/signalements">Signalements</NavLink>
          {roleLvl >= ROLE_LEVEL.COORDINATEUR && <NavLink href="/sentinelles">Sentinelles</NavLink>}
          {roleLvl >= ROLE_LEVEL.ADMIN && <NavLink href="/admin">Admin</NavLink>}
        </nav>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              style={{
                background: '#0F172A', color: 'white', border: 'none',
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                fontSize: '0.82rem', fontWeight: 600, letterSpacing: '-0.005em',
              }}
            >
              + Nouvelle alerte
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 4px 4px', borderRadius: 8, background: '#FAFAFA', border: '1px solid #F1F5F9' }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6,
              background: '#0F172A', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.72rem', fontWeight: 600,
            }}>
              {user.name.split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase() || 'OL'}
            </div>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0F172A' }}>{user.name}</div>
              <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{ROLE_LABELS[user.role] || user.role}</div>
            </div>
          </div>
          <button onClick={logout} style={{ background: 'white', color: '#64748B', border: '1px solid #E5E7EB', padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500 }}>
            Déconnexion
          </button>
        </div>
      </header>

      {/* Stats bar */}
      <StatsBar alerts={alerts} />

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: '#FAFAFA' }}>
        {/* Sidebar */}
        <aside style={{ width: 400, display: 'flex', flexDirection: 'column', borderRight: '1px solid #F1F5F9', background: 'white', flexShrink: 0 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['active', 'all'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: activeTab === t ? 600 : 500,
                    background: activeTab === t ? '#0F172A' : 'transparent',
                    color: activeTab === t ? 'white' : '#64748B',
                    letterSpacing: '-0.005em',
                  }}
                >
                  {t === 'active' ? 'En cours' : 'Toutes'}
                </button>
              ))}
            </div>
            <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 500 }}>
              {loading ? '…' : `${filteredAlerts.length} ${filteredAlerts.length > 1 ? 'alertes' : 'alerte'}`}
            </span>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: '0.88rem' }}>Chargement…</div>
            ) : (
              <AlertsFeed alerts={filteredAlerts} onSelect={setSelected} />
            )}
          </div>
        </aside>

        {/* Map */}
        <main style={{ flex: 1, position: 'relative' }}>
          <AlertMap alerts={alerts} selected={selected} onSelect={setSelected} />
        </main>
      </div>

      {/* Alert detail panel */}
      {selected && (
        <AlertDetail
          alert={selected}
          currentUser={user}
          onClose={() => setSelected(null)}
          onRefetch={refetch}
        />
      )}

      {/* Create alert modal */}
      {showCreate && (
        <CreateAlertModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refetch(); }}
        />
      )}
    </div>
  );
}

function NavLink({ href, children, active }: { href: string; children: React.ReactNode; active?: boolean }) {
  return (
    <a href={href} style={{
      color: active ? '#0F172A' : '#64748B',
      background: active ? '#F1F5F9' : 'transparent',
      fontSize: '0.82rem',
      fontWeight: active ? 600 : 500,
      textDecoration: 'none',
      padding: '6px 12px',
      borderRadius: 6,
      letterSpacing: '-0.005em',
    }}>{children}</a>
  );
}

function LoginRedirect() {
  useEffect(() => { window.location.href = '/login'; }, []);
  return null;
}
