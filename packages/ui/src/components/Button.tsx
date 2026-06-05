import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  primary: { background: '#1a3c5e', color: 'white' },
  danger: { background: '#e74c3c', color: 'white' },
  secondary: { background: '#f1f5f9', color: '#334155' },
};

const sizes: Record<string, React.CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: '0.8rem' },
  md: { padding: '10px 16px', fontSize: '0.9rem' },
  lg: { padding: '14px 24px', fontSize: '1rem' },
};

export function Button({ variant = 'primary', size = 'md', loading, children, disabled, style, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      style={{
        border: 'none',
        borderRadius: 6,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        fontWeight: 600,
        opacity: disabled || loading ? 0.6 : 1,
        ...styles[variant],
        ...sizes[size],
        ...style,
      }}
      {...props}
    >
      {loading ? 'Chargement...' : children}
    </button>
  );
}
