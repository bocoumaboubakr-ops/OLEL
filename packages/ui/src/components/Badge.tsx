import React from 'react';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info';

const colors: Record<BadgeVariant, { bg: string; color: string }> = {
  success: { bg: '#dcfce7', color: '#16a34a' },
  warning: { bg: '#fef3c7', color: '#92400e' },
  danger: { bg: '#fee2e2', color: '#dc2626' },
  info: { bg: '#dbeafe', color: '#1d4ed8' },
};

export function Badge({ variant = 'info', children }: { variant?: BadgeVariant; children: React.ReactNode }) {
  const { bg, color } = colors[variant];
  return (
    <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 600 }}>
      {children}
    </span>
  );
}
