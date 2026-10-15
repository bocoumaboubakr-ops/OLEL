import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';

// IBM Plex Sans : rend correctement les caractères Pulaar (ɓ, ɗ, ŋ, ƴ)
// contrairement à Inter sur certains subsets.
const plex = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'OLEL Dashboard – Alerte Précoce',
  description: 'Tableau de bord de la plateforme OLEL – Région de Matam',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={plex.variable}>
      <body style={{
        margin: 0,
        fontFamily: 'var(--font-body), "IBM Plex Sans", -apple-system, "Segoe UI", Roboto, sans-serif',
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
