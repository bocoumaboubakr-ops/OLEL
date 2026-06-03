'use client';

import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const SEVERITY_COLOR: Record<number, string> = {
  1: '#22c55e',
  2: '#f59e0b',
  3: '#ef4444',
};

const TYPE_ICON: Record<string, string> = {
  INONDATION: '🌊',
  INCENDIE: '🔥',
  SECHERESSE: '☀️',
  EPIDEMIE: '🦠',
  AUTRE: '⚠️',
};

export function AlertsFeed({ alerts }: { alerts: any[] }) {
  if (!alerts.length) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
        <p>Aucune alerte active</p>
      </div>
    );
  }

  return (
    <div>
      {alerts.map((alert) => (
        <div
          key={alert.id}
          style={{
            padding: '16px',
            borderBottom: '1px solid #eee',
            borderLeft: `4px solid ${SEVERITY_COLOR[alert.severity] || '#888'}`,
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1a3c5e' }}>
              {TYPE_ICON[alert.type] || '⚠️'} {alert.title}
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                borderRadius: 10,
                background: alert.status === 'ACTIVE' ? '#dcfce7' : '#fef3c7',
                color: alert.status === 'ACTIVE' ? '#16a34a' : '#92400e',
              }}
            >
              {alert.status}
            </span>
          </div>
          <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {alert.description}
          </p>
          <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem', color: '#888' }}>
            <span>📍 {alert.zone?.name || 'Zone inconnue'}</span>
            <span>
              {formatDistanceToNow(new Date(alert.createdAt), { locale: fr, addSuffix: true })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
