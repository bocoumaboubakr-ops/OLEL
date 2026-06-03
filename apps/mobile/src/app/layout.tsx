import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'OLEL – Signalement Citoyen',
  description: 'Signalez et consultez les alertes de votre zone',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1a3c5e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8f9fa', maxWidth: 480, margin: '0 auto' }}>
        {children}
      </body>
    </html>
  );
}
