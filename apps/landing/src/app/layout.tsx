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
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'OLEL — Alerte précoce · Matam',
    description: 'Système d\'alerte communautaire multi-risques · Matam, Sénégal',
    locale: 'fr_SN',
    type: 'website',
    images: [
      { url: '/hero-banner.jpg', width: 1536, height: 1024, alt: 'OLEL — L\'alerte précoce au service des communautés' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OLEL — Alerte précoce · Matam',
    description: 'Système d\'alerte communautaire multi-risques · Matam, Sénégal',
    images: ['/hero-banner.jpg'],
  },
  metadataBase: new URL('https://olel.app'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${plex.variable} ${serif.variable}`}>
      <head>
        {/* Responsive overrides — voir page.tsx pour les classNames associés */}
        <style dangerouslySetInnerHTML={{ __html: `
          /* Tablette et mobile (≤900px) */
          @media (max-width: 900px) {
            .olel-container { padding-left: 20px !important; padding-right: 20px !important; }
            .olel-section { padding-top: 72px !important; padding-bottom: 72px !important; }
            .olel-hero { padding-top: 64px !important; padding-bottom: 56px !important; }
            .olel-nav-links { display: none !important; }

            /* Grilles 2-3 colonnes séparées par filets verticaux → stack + filets horizontaux */
            .olel-stack-md { grid-template-columns: 1fr !important; gap: 0 !important; border-top: none !important; }
            .olel-stack-md > * {
              border-right: none !important;
              padding-left: 0 !important;
              padding-right: 0 !important;
              padding-top: 32px !important;
              padding-bottom: 32px !important;
              border-top: 1px solid #F1F5F9 !important;
            }

            /* Stats : 5 cols → 2 cols sur tablette */
            .olel-stats-grid { grid-template-columns: 1fr 1fr !important; padding: 40px 20px !important; gap: 0 !important; }
            .olel-stats-grid > div {
              padding: 24px 16px !important;
              border-right: none !important;
              border-bottom: 1px solid #F1F5F9 !important;
            }
            .olel-stats-grid > div:nth-last-child(-n+2) { border-bottom: none !important; }
            .olel-stats-grid > div:nth-child(odd) { border-right: 1px solid #F1F5F9 !important; }

            /* HowItWorks 80/1fr/2fr → single col */
            .olel-step {
              grid-template-columns: 1fr !important;
              gap: 12px !important;
              padding: 32px 0 !important;
            }
            .olel-step h3 { font-size: 1.4rem !important; }

            /* Channels 120/200/1fr → single col */
            .olel-channel {
              grid-template-columns: 1fr !important;
              gap: 6px !important;
              padding: 20px 0 !important;
            }

            /* Footer 4 cols → 1 col */
            .olel-footer-grid { grid-template-columns: 1fr !important; gap: 32px !important; margin-bottom: 40px !important; }

            /* Partners 4 cols (auto-fit) → 2 cols clean */
            .olel-partners-grid { grid-template-columns: 1fr 1fr !important; }

            /* Showcase figures : caption plus petite, padding réduit */
            figure { margin: 0 !important; }

            /* Hero : marges réduites + tailles ajustées */
            h1 { letter-spacing: -0.03em !important; }
          }

          /* Mobile compact (≤480px) */
          @media (max-width: 480px) {
            .olel-container { padding-left: 16px !important; padding-right: 16px !important; }
            .olel-section { padding-top: 56px !important; padding-bottom: 56px !important; }
            .olel-hero { padding-top: 48px !important; padding-bottom: 40px !important; }

            /* Stats : 1 col en téléphone */
            .olel-stats-grid { grid-template-columns: 1fr !important; padding: 24px 16px !important; }
            .olel-stats-grid > div {
              padding: 18px 0 !important;
              border-right: none !important;
              border-bottom: 1px solid #F1F5F9 !important;
            }
            .olel-stats-grid > div:last-child { border-bottom: none !important; }

            /* Partners 1 col */
            .olel-partners-grid { grid-template-columns: 1fr !important; }

            /* Buttons full width sur mobile compact */
            .olel-cta-row { flex-direction: column !important; align-items: stretch !important; }
            .olel-cta-row > a { text-align: center !important; }

            /* Nav : logo + CTA seulement, et CTA plus compact */
            .olel-nav-cta { padding: 7px 12px !important; font-size: 0.8rem !important; }
          }
        ` }} />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </head>
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
