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
        gap: 4,
        padding: small ? '1px 6px' : '2px 9px',
        borderRadius: 10,
        background: cfg.bg,
        color: cfg.color,
        fontWeight: 700,
        fontSize: small ? '0.68rem' : '0.72rem',
        border: `1px solid ${cfg.color}33`,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}
