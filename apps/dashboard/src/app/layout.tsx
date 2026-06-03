import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OLEL Dashboard – Alerte Précoce',
  description: 'Tableau de bord de la plateforme OLEL – Matam/Gorgol',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f4f6f9' }}>
        {children}
      </body>
    </html>
  );
}
