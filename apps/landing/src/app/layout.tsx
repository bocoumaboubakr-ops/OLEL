import type { Metadata } from 'next';
import { IBM_Plex_Sans, Source_Serif_4 } from 'next/font/google';

// IBM Plex Sans : couvre les caractères Pulaar (ɓ, ɗ, ŋ, ƴ).
const plex = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body',
});

// Source Serif 4 : display serif pour les titres institutionnels.
const serif = Source_Serif_4({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'OLEL — Alerte précoce multi-risques · Matam',
  description: 'Plateforme communautaire d\'alerte précoce pour la région de Matam (Sénégal). Système multilingue par WhatsApp, SMS, application mobile et radio.',
  openGraph: {
    title: 'OLEL — Alerte précoce · Matam',
    description: 'Système d\'alerte communautaire multi-risques · Matam, Sénégal',
    locale: 'fr_SN',
    type: 'website',
  },
  metadataBase: new URL('https://olel.app'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${plex.variable} ${serif.variable}`}>
      <body style={{
        margin: 0,
        fontFamily: 'var(--font-body), "IBM Plex Sans", -apple-system, "Segoe UI", Roboto, sans-serif',
        fontFeatureSettings: '"cv11", "ss01", "ss03"',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        background: '#FAFAFA',
        color: '#0F172A',
        lineHeight: 1.5,
      }}>
        {children}
      </body>
    </html>
  );
}
