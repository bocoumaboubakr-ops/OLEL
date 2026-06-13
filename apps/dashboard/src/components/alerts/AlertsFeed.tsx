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
      <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
        <p style={{ margin: 0 }}>Aucune alerte active</p>
      </div>
    );
  }

  return (
    <div>
      {alerts.map((alert) => {
        const meta = TYPE_META[alert.type] || TYPE_META.AUTRE;
        const sev = SEVERITY_COLOR[alert.severity] || '#888';
        const status = STATUS_STYLE[alert.status] || STATUS_STYLE.PENDING;

        return (
          <div
            key={alert.id}
            onClick={() => onSelect?.(alert)}
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid #f1f5f9',
              borderLeft: `4px solid ${sev}`,
              cursor: onSelect ? 'pointer' : 'default',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1a3c5e', flex: 1 }}>
                {meta.icon} {alert.title}
              </span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                {alert.alertLevel && <AlertLevelBadge level={alert.alertLevel} size="sm" />}
                <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, background: status.bg, color: status.color, whiteSpace: 'nowrap', fontWeight: 600 }}>
                  {status.label}
                </span>
              </div>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {alert.description}
            </p>
            <div style={{ display: 'flex', gap: 10, fontSize: '0.75rem', color: '#94a3b8', alignItems: 'center' }}>
              <span>📍 {alert.zone?.name || 'Zone inconnue'}</span>
              <span style={{ padding: '1px 6px', borderRadius: 6, background: sev + '22', color: sev, fontWeight: 600 }}>
                {SEVERITY_LABEL[alert.severity] || 'N/A'}
              </span>
              <span style={{ marginLeft: 'auto' }}>
                {formatDistanceToNow(new Date(alert.createdAt), { locale: fr, addSuffix: true })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
