import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';

// IBM Plex Sans : couvre les caractères Pulaar (ɓ, ɗ, ŋ, ƴ) nativement,
// contrairement à Inter dont le subset standard les rend en fallback système.
const plex = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'OLEL – Alerte Précoce Multi-Risques',
  description: 'Signalez et consultez les alertes de risques dans votre zone – Matam',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'OLEL' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0F172A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={plex.variable}>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body style={{
        margin: 0,
        fontFamily: 'var(--font-body), "IBM Plex Sans", -apple-system, "Segoe UI", Roboto, sans-serif',
        fontFeatureSettings: '"cv11", "ss01", "ss03"',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        background: '#FAFAFA',
        color: '#0F172A',
        maxWidth: 480,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}>
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
