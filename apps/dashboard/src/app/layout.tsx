import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'OLEL Dashboard – Alerte Précoce',
  description: 'Tableau de bord de la plateforme OLEL – Région de Matam',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body style={{
        margin: 0,
        fontFamily: 'var(--font-inter), -apple-system, "Segoe UI", Roboto, sans-serif',
        fontFeatureSettings: '"cv11", "ss01", "ss03"',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        background: '#FAFAFA',
        color: '#0F172A',
      }}>
        {children}
      </body>
    </html>
  );
}
