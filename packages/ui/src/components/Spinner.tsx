import React from 'react';

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `${size / 8}px solid #e2e8f0`,
        borderTop: `${size / 8}px solid #1a3c5e`,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        display: 'inline-block',
      }}
    />
  );
}
