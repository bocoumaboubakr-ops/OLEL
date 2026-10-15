'use client';

import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AlertLevelBadge } from '@/components/governance/AlertLevelBadge';

export const SEVERITY_COLOR: Record<number, string> = {
  1: '#22c55e',
  2: '#f59e0b',
  3: '#ef4444',
};

export const SEVERITY_LABEL: Record<number, string> = {
  1: 'Vigilance',
  2: 'Alerte',
  3: 'Urgence',
};

export const TYPE_META: Record<string, { icon: string; label: string }> = {
  INONDATION:           { icon: '🌊', label: 'Inondation' },
  SECHERESSE:           { icon: '☀️', label: 'Sécheresse' },
  INCENDIE:             { icon: '🔥', label: 'Incendie' },
  TEMPETE:              { icon: '🌪️', label: 'Tempête' },
  EPIDEMIE:             { icon: '🦠', label: 'Épidémie' },
  LOCUSTES:             { icon: '🦗', label: 'Criquets/Nuisibles' },
  ACCIDENT_INDUSTRIEL:  { icon: '🏭', label: 'Accident industriel' },
  MOUVEMENT_DE_TERRAIN: { icon: '⛰️', label: 'Mouvement de terrain' },
  AUTRE:                { icon: '⚠️', label: 'Autre' },
};

export const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  PENDING:      { bg: '#fef3c7', color: '#92400e', label: 'Signalement' },
  UNDER_REVIEW: { bg: '#fef9c3', color: '#a16207', label: 'En vérification' },
  VALIDATED:    { bg: '#e0e7ff', color: '#4338ca', label: 'Validée' },
  BROADCASTING: { bg: '#fae8ff', color: '#a21caf', label: 'Diffusion…' },
  BROADCAST:    { bg: '#fee2e2', color: '#dc2626', label: 'Diffusée' },
  ACTIVE:       { bg: '#dcfce7', color: '#16a34a', label: 'Active' },
  RESOLVED:     { bg: '#dbeafe', color: '#1d4ed8', label: 'Résolue' },
  CLOSED:       { bg: '#dbeafe', color: '#1d4ed8', label: 'Clôturée' },
  REJECTED:     { bg: '#f1f5f9', color: '#64748b', label: 'Rejetée' },
  CANCELLED:    { bg: '#f1f5f9', color: '#64748b', label: 'Annulée' },
};

/**
 * Workflow v3 — cursus court urgence-first.
 * 3 phases logiques : RÉCEPTION → VÉRIFIÉE → [CONFIRMÉE si ROUGE+] → DIFFUSÉE
 * (anciens steps SENTINELLE/COORDINATEUR/GOUVERNANCE encore en DB sont mappés
 *  par STEP_LABEL pour rétrocompat mais ne sont plus des étapes UI.)
 */
export const WORKFLOW_STEPS = ['SIGNALEMENT', 'MAIRIE', 'PREFECTURE', 'BROADCAST', 'CLOSED'] as const;

/** Vue compacte 3 ronds (pour le timeline header). */
export const COMPACT_STEPS = ['SIGNALEMENT', 'MAIRIE', 'BROADCAST'] as const;
export const COMPACT_LABELS: Record<string, string> = {
  SIGNALEMENT: 'Reçue', MAIRIE: 'Vérifiée', BROADCAST: 'Diffusée',
};

export const STEP_LABEL: Record<string, string> = {
  SIGNALEMENT:  'Reçue',
  SENTINELLE:   'Reçue',
  COORDINATEUR: 'Vérifiée',
  MAIRIE:       'Vérifiée',
  PREFECTURE:   'Confirmée',
  GOUVERNANCE:  'Confirmée',
  BROADCAST:    'Diffusée',
  CLOSED:       'Clôture',
};

/** Statuts considérés « en cours » (non terminaux) pour le filtre dashboard. */
export const ACTIVE_STATUSES = ['PENDING', 'UNDER_REVIEW', 'VALIDATED', 'BROADCASTING', 'BROADCAST', 'ACTIVE'];
export const TERMINAL_STATUSES = ['CLOSED', 'RESOLVED', 'REJECTED', 'CANCELLED'];

export function AlertsFeed({ alerts, onSelect }: { alerts: any[]; onSelect?: (a: any) => void }) {
  if (!alerts.length) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#94A3B8' }}>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>Aucune alerte active</p>
        <p style={{ margin: '6px 0 0', fontSize: '0.78rem' }}>Les signalements apparaîtront ici en temps réel.</p>
      </div>
    );
  }

  return (
    <div>
      {alerts.map((alert) => {
        const meta = TYPE_META[alert.type] || TYPE_META.AUTRE;
        const sev = SEVERITY_COLOR[alert.severity] || '#94A3B8';
        const status = STATUS_STYLE[alert.status] || STATUS_STYLE.PENDING;

        return (
          <div
            key={alert.id}
            onClick={() => onSelect?.(alert)}
            style={{
              padding: '16px 18px',
              borderBottom: '1px solid #F1F5F9',
              cursor: onSelect ? 'pointer' : 'default',
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: sev + '14', color: sev,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.05rem', flexShrink: 0,
            }}>{meta.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8 }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0F172A', flex: 1, letterSpacing: '-0.005em', lineHeight: 1.3 }}>
                  {alert.title}
                </span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                  {alert.alertLevel && <AlertLevelBadge level={alert.alertLevel} size="sm" />}
                </div>
              </div>
              <p style={{ margin: '0 0 6px', fontSize: '0.8rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                {alert.description}
              </p>
              <div style={{ display: 'flex', gap: 8, fontSize: '0.72rem', color: '#94A3B8', alignItems: 'center', flexWrap: 'wrap' }}>
                <span>{alert.zone?.name || 'Zone inconnue'}</span>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#CBD5E1' }} />
                <span style={{ padding: '2px 7px', borderRadius: 5, background: sev + '14', color: sev, fontWeight: 600 }}>
                  {SEVERITY_LABEL[alert.severity] || 'N/A'}
                </span>
                <span style={{ padding: '2px 7px', borderRadius: 5, background: status.bg, color: status.color, fontWeight: 500 }}>
                  {status.label}
                </span>
                <span style={{ marginLeft: 'auto', fontWeight: 500 }}>
                  {formatDistanceToNow(new Date(alert.createdAt), { locale: fr, addSuffix: true })}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
