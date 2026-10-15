'use client';

import { LEVEL_CONFIG, AlertLevel } from '@/lib/governance';

export function AlertLevelBadge({ level, size = 'md' }: { level?: string; size?: 'sm' | 'md' }) {
  const cfg = LEVEL_CONFIG[(level as AlertLevel)] || LEVEL_CONFIG.BLEU;
  const small = size === 'sm';
  return (
    <span
      title={`Niveau ${cfg.label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: small ? '2px 7px' : '3px 9px',
        borderRadius: 5,
        background: cfg.bg,
        color: cfg.color,
        fontWeight: 600,
        fontSize: small ? '0.68rem' : '0.72rem',
        whiteSpace: 'nowrap',
        letterSpacing: '0.005em',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}
